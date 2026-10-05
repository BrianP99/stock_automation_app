import { getStore } from '@netlify/blobs';
import { postToDiscord, type DiscordNotifyResult } from '../discord';
import { generateLottoPicks, generatePensionPicks, lottoRank, pensionRanks, type LottoPicks, type PensionPicks } from './analysis';
import { loadLottoHistory, loadPensionHistory, upcomingDraw } from './history';
import type { LottoDraw, PensionDraw } from './dhlottery';

const STORE_NAME = 'lottery';
const WEBHOOK_ENV = 'LOTTERY_DISCORD_WEBHOOK_URL';
const LOTTO_GAMES = 5; // 1,000원 × 5 = 5,000원
const PENSION_GROUPS = [1, 2, 3, 4, 5]; // 모든조: 1,000원 × 5 = 5,000원

interface SavedPicks {
  lotto?: { drawNo: number; games: number[][] };
  pension?: { drawNo: number; number: string };
}

function store() {
  return getStore(STORE_NAME, { consistency: 'strong' });
}

async function readPicks(key: string): Promise<SavedPicks> {
  try {
    return ((await store().get(key, { type: 'json' })) as SavedPicks | null) ?? {};
  } catch {
    return {};
  }
}

export interface WeeklyLotteryResult {
  lottoDrawNo: number;
  lotto: LottoPicks;
  pensionDrawNo: number;
  pension: PensionPicks;
  warnings: string[];
  payload: unknown;
}

function lastWeekLines(saved: SavedPicks, lottoHistory: LottoDraw[], pensionHistory: PensionDraw[]): string[] {
  const lines: string[] = [];
  if (saved.lotto) {
    const draw = lottoHistory.find((d) => d.drawNo === saved.lotto!.drawNo);
    if (draw) {
      const ranks = saved.lotto.games.map((g) => lottoRank(g, draw));
      const wins = ranks.filter((r): r is number => r !== null);
      lines.push(
        `**로또 ${draw.drawNo}회** 당첨번호 ${draw.numbers.join(' ')} + ${draw.bonus}\n` +
          (wins.length ? `🎉 ${wins.map((r) => `${r}등`).join(', ')} 당첨!` : '이번엔 당첨 없음'),
      );
    }
  }
  if (saved.pension) {
    const draw = pensionHistory.find((d) => d.drawNo === saved.pension!.drawNo);
    if (draw) {
      const wins = PENSION_GROUPS.flatMap((g) => pensionRanks(g, saved.pension!.number, draw).map((r) => `${g}조 ${r}`));
      lines.push(
        `**연금복권 ${draw.drawNo}회** 1등 ${draw.group}조 ${draw.number} · 보너스 ${draw.bonus}\n` +
          (wins.length ? `🎉 ${wins.join(', ')} 당첨!` : '이번엔 당첨 없음'),
      );
    }
  }
  return lines;
}

/** Builds this week's picks and the Discord message without sending or saving anything. */
export async function buildWeeklyLottery(now = new Date()): Promise<WeeklyLotteryResult> {
  const [lottoHistory, pensionHistory] = await Promise.all([loadLottoHistory(now), loadPensionHistory(now)]);
  const lottoTarget = upcomingDraw('lotto', now);
  const pensionTarget = upcomingDraw('pension', now);

  const lotto = generateLottoPicks(lottoHistory.draws, lottoTarget.drawNo, LOTTO_GAMES);
  const pension = generatePensionPicks(pensionHistory.draws, pensionTarget.drawNo);

  // If the history is behind, say so: the picks are still valid, but the analysis is missing recent draws.
  const warnings: string[] = [];
  if (lottoHistory.draws.at(-1)!.drawNo < lottoTarget.drawNo - 1) {
    warnings.push(`로또 최신 회차를 못 가져와 ${lotto.stats.latestDrawNo}회까지로 분석했습니다. (${lottoHistory.fetchError ?? '데이터 없음'})`);
  }
  if (pensionHistory.draws.at(-1)!.drawNo < pensionTarget.drawNo - 1) {
    warnings.push(`연금복권 최신 회차를 못 가져와 ${pension.stats.latestDrawNo}회까지로 분석했습니다. (${pensionHistory.fetchError ?? '데이터 없음'})`);
  }

  const previous = await readPicks(`picks-${lottoTarget.drawNo - 1}`);
  const resultLines = lastWeekLines(previous, lottoHistory.draws, pensionHistory.draws);

  const gameLines = lotto.games
    .map((g, i) => `${String.fromCharCode(65 + i)}  ${g.map((n) => String(n).padStart(2, ' ')).join('  ')}`)
    .join('\n');
  const { stats: ls } = lotto;

  const embeds = [
    {
      title: `🎱 로또 6/45 제${lottoTarget.drawNo}회 (${lottoTarget.date} 토 추첨)`,
      description: `5게임 · 5,000원\n\`\`\`\n${gameLines}\n\`\`\``,
      color: 0xfbbf24,
      fields: [
        { name: `최근 52회 자주 나온 번호`, value: ls.hotRecent.join(', '), inline: true },
        { name: '오래 안 나온 번호', value: ls.coldOverdue.map((c) => `${c.number}(${c.gap}회)`).join(', '), inline: true },
        {
          name: '적용한 조건',
          value:
            `합계 ${ls.sumRange[0]}~${ls.sumRange[1]} · 홀짝 2~4개 · 낮은수(1~22) 2~4개 · 3연속 번호 제외 · 역대 1등 조합 제외 · 게임 간 겹침 2개 이하\n` +
            `(역대 1등 조합 ${ls.drawCount}개 중 ${Math.round(ls.filterPassRate * 100)}%가 이 조건 충족)`,
        },
      ],
    },
    {
      title: `🎫 연금복권720+ 제${pensionTarget.drawNo}회 (${pensionTarget.date} 목 추첨)`,
      description: `모든조(1~5조) · 5,000원\n\`\`\`\n${PENSION_GROUPS.map((g) => `${g}조  ${pension.number.split('').join(' ')}`).join('\n')}\n\`\`\``,
      color: 0x22c55e,
      fields: [
        { name: '자리별 역대 최다 숫자', value: pension.stats.topDigitByPosition.join(' '), inline: true },
        {
          name: '1등 조 분포',
          value: PENSION_GROUPS.map((g) => `${g}조 ${pension.stats.groupCounts[g]}회`).join(' · '),
          inline: true,
        },
      ],
    },
    ...(resultLines.length ? [{ title: '📋 지난주 번호 결과', description: resultLines.join('\n\n'), color: 0x6366f1 }] : []),
    {
      description:
        '※ 추첨은 매회 독립적인 무작위라 과거 데이터로 당첨 확률을 높일 수는 없습니다. 분석은 흔한 패턴을 피하는 용도로만 참고하세요.' +
        (warnings.length ? `\n⚠️ ${warnings.join('\n⚠️ ')}` : ''),
      color: 0x9ca3af,
      timestamp: now.toISOString(),
    },
  ];

  return {
    lottoDrawNo: lottoTarget.drawNo,
    lotto,
    pensionDrawNo: pensionTarget.drawNo,
    pension,
    warnings,
    payload: { username: '복권 번호 알림봇', embeds },
  };
}

/** Builds, sends to Discord, and remembers the picks so next week can check them. */
export async function runWeeklyLottery(now = new Date()): Promise<{ result: WeeklyLotteryResult; notify: DiscordNotifyResult }> {
  const result = await buildWeeklyLottery(now);
  const notify = await postToDiscord(result.payload, WEBHOOK_ENV);
  const saved: SavedPicks = {
    lotto: { drawNo: result.lottoDrawNo, games: result.lotto.games },
    pension: { drawNo: result.pensionDrawNo, number: result.pension.number },
  };
  try {
    await store().setJSON(`picks-${result.lottoDrawNo}`, saved);
  } catch (err) {
    console.error('Saving lottery picks failed:', err);
  }
  return { result, notify };
}
