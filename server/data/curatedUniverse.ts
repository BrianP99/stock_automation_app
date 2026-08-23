// Curated trading universe for the autonomous scanner — deliberately NOT the
// full exchange listing (thousands of obscure names). This is "대장주 +
// 유망 변동성 종목" per product decision: well-known sector leaders across
// KOSPI/KOSDAQ and S&P500/Nasdaq, plus popular high-beta growth names.
// Single-stock, non-leveraged only — no leveraged/inverse ETFs (too high-risk
// to hold, and inverse products decay badly if the engine ever holds one
// through a multi-day swing). Every symbol here is a real, verified ticker —
// edit/expand this list freely; it's just data.

export type Market = 'KRX' | 'US';

export interface UniverseSymbol {
  symbol: string;
  name: string;
  market: Market;
  currency: 'KRW' | 'USD';
}

function krx(symbol: string, name: string): UniverseSymbol {
  return { symbol, name, market: 'KRX', currency: 'KRW' };
}

function us(symbol: string, name: string): UniverseSymbol {
  return { symbol, name, market: 'US', currency: 'USD' };
}

// --- Korea: KOSPI/KOSDAQ sector leaders + popular momentum names -----------
const KRX_LEADERS: UniverseSymbol[] = [
  krx('005930', '삼성전자'), krx('000660', 'SK하이닉스'), krx('373220', 'LG에너지솔루션'),
  krx('207940', '삼성바이오로직스'), krx('005380', '현대차'), krx('000270', '기아'),
  krx('068270', '셀트리온'), krx('005490', 'POSCO홀딩스'), krx('035420', 'NAVER'),
  krx('035720', '카카오'), krx('006400', '삼성SDI'), krx('051910', 'LG화학'),
  krx('028260', '삼성물산'), krx('012330', '현대모비스'), krx('105560', 'KB금융'),
  krx('055550', '신한지주'), krx('086790', '하나금융지주'), krx('316140', '우리금융지주'),
  krx('032830', '삼성생명'), krx('003670', '포스코퓨처엠'), krx('247540', '에코프로비엠'),
  krx('086520', '에코프로'), krx('066570', 'LG전자'), krx('003550', 'LG'),
  krx('034730', 'SK'), krx('018260', '삼성에스디에스'), krx('011200', 'HMM'),
  krx('010140', '삼성중공업'), krx('042660', '한화오션'), krx('064350', '현대로템'),
  krx('012450', '한화에어로스페이스'), krx('079550', 'LIG넥스원'), krx('047810', '한국항공우주'),
  krx('096770', 'SK이노베이션'), krx('010950', 'S-Oil'), krx('030200', 'KT'),
  krx('017670', 'SK텔레콤'), krx('259960', '크래프톤'), krx('036570', '엔씨소프트'),
  krx('251270', '넷마블'), krx('352820', '하이브'), krx('090430', '아모레퍼시픽'),
  krx('097950', 'CJ제일제당'), krx('271560', '오리온'), krx('128940', '한미약품'),
  krx('009150', '삼성전기'), krx('011070', 'LG이노텍'), krx('010130', '고려아연'),
  krx('033780', 'KT&G'), krx('015760', '한국전력'), krx('024110', '기업은행'),
  krx('021240', '코웨이'), krx('088350', '한화생명'), krx('006800', '미래에셋증권'),
  krx('016360', '삼성증권'), krx('039490', '키움증권'), krx('180640', '한진칼'),
  krx('020150', '롯데에너지머티리얼즈'), krx('161390', '한국타이어앤테크놀로지'),
];

const KRX_GROWTH: UniverseSymbol[] = [
  krx('091990', '셀트리온헬스케어'), krx('196170', '알테오젠'), krx('145020', '휴젤'),
  krx('214450', '파마리서치'), krx('328130', '루닛'), krx('141080', '레고켐바이오'),
  krx('277810', '레인보우로보틱스'), krx('348370', '엔켐'), krx('137400', '피엔티'),
  krx('403870', 'HPSP'), krx('042700', '한미반도체'), krx('178320', '서울반도체'),
  krx('357780', '솔브레인'), krx('240810', '원익IPS'), krx('039030', '이오테크닉스'),
  krx('222080', '씨아이에스'), krx('065350', '신성델타테크'), krx('900140', '엘브이엠씨홀딩스'),
  krx('112040', '위메이드'), krx('263750', '펄어비스'), krx('293490', '카카오게임즈'),
  krx('095340', 'ISC'), krx('108860', '셀바스AI'), krx('054450', '텍셀네트컴'),
  krx('950130', '엑세스바이오'), krx('065660', '안트로젠'), krx('085660', '차바이오텍'),
  krx('347860', '알체라'), krx('225570', '넥슨게임즈'), krx('036830', '솔브레인홀딩스'),
];

// --- US: S&P500/Nasdaq leaders + popular growth/momentum names -------------
const US_LEADERS: UniverseSymbol[] = [
  us('AAPL', 'Apple'), us('MSFT', 'Microsoft'), us('GOOGL', 'Alphabet A'), us('GOOG', 'Alphabet C'),
  us('AMZN', 'Amazon'), us('NVDA', 'NVIDIA'), us('META', 'Meta Platforms'), us('TSLA', 'Tesla'),
  us('BRK-B', 'Berkshire Hathaway B'), us('LLY', 'Eli Lilly'), us('AVGO', 'Broadcom'), us('JPM', 'JPMorgan Chase'),
  us('V', 'Visa'), us('UNH', 'UnitedHealth'), us('XOM', 'Exxon Mobil'), us('MA', 'Mastercard'),
  us('PG', 'Procter & Gamble'), us('HD', 'Home Depot'), us('COST', 'Costco'), us('MRK', 'Merck'),
  us('ABBV', 'AbbVie'), us('PEP', 'PepsiCo'), us('KO', 'Coca-Cola'), us('WMT', 'Walmart'),
  us('BAC', 'Bank of America'), us('CRM', 'Salesforce'), us('NFLX', 'Netflix'), us('ADBE', 'Adobe'),
  us('AMD', 'AMD'), us('TMO', 'Thermo Fisher'), us('ORCL', 'Oracle'), us('CSCO', 'Cisco'),
  us('ACN', 'Accenture'), us('MCD', "McDonald's"), us('ABT', 'Abbott Labs'), us('DIS', 'Disney'),
  us('LIN', 'Linde'), us('WFC', 'Wells Fargo'), us('DHR', 'Danaher'), us('TXN', 'Texas Instruments'),
  us('PM', 'Philip Morris'), us('INTC', 'Intel'), us('VZ', 'Verizon'), us('CMCSA', 'Comcast'),
  us('NKE', 'Nike'), us('IBM', 'IBM'), us('QCOM', 'Qualcomm'), us('HON', 'Honeywell'),
  us('UPS', 'UPS'), us('CAT', 'Caterpillar'), us('GS', 'Goldman Sachs'), us('AMGN', 'Amgen'),
  us('LOW', "Lowe's"), us('SBUX', 'Starbucks'), us('BA', 'Boeing'), us('DE', 'Deere'),
  us('BLK', 'BlackRock'), us('SPGI', 'S&P Global'), us('ELV', 'Elevance Health'), us('MDT', 'Medtronic'),
  us('GE', 'GE Aerospace'), us('ISRG', 'Intuitive Surgical'), us('NOW', 'ServiceNow'), us('AMAT', 'Applied Materials'),
  us('LMT', 'Lockheed Martin'), us('PLD', 'Prologis'), us('T', 'AT&T'), us('MU', 'Micron'),
  us('ADI', 'Analog Devices'), us('BKNG', 'Booking Holdings'), us('MDLZ', 'Mondelez'), us('GILD', 'Gilead Sciences'),
  us('VRTX', 'Vertex Pharma'), us('C', 'Citigroup'), us('SYK', 'Stryker'), us('TJX', 'TJX Companies'),
  us('REGN', 'Regeneron'), us('ADP', 'ADP'), us('CB', 'Chubb'), us('MMC', 'Marsh McLennan'),
  us('SO', 'Southern Company'), us('PGR', 'Progressive'), us('ZTS', 'Zoetis'), us('CI', 'Cigna'),
  us('DUK', 'Duke Energy'), us('EOG', 'EOG Resources'), us('BSX', 'Boston Scientific'), us('CME', 'CME Group'),
  us('SLB', 'Schlumberger'), us('SCHW', 'Charles Schwab'), us('ETN', 'Eaton'), us('AON', 'Aon'),
  us('PANW', 'Palo Alto Networks'), us('EQIX', 'Equinix'), us('ITW', 'Illinois Tool Works'), us('CSX', 'CSX'),
  us('USB', 'US Bancorp'),
];

const US_GROWTH: UniverseSymbol[] = [
  us('PLTR', 'Palantir'), us('SMCI', 'Super Micro Computer'), us('COIN', 'Coinbase'), us('MSTR', 'MicroStrategy'),
  us('RIVN', 'Rivian'), us('LCID', 'Lucid'), us('SOFI', 'SoFi Technologies'), us('MARA', 'Marathon Digital'),
  us('RIOT', 'Riot Platforms'), us('AFRM', 'Affirm'), us('UPST', 'Upstart'), us('DKNG', 'DraftKings'),
  us('ROKU', 'Roku'), us('SNAP', 'Snap'), us('PINS', 'Pinterest'), us('ABNB', 'Airbnb'),
  us('UBER', 'Uber'), us('LYFT', 'Lyft'), us('DASH', 'DoorDash'), us('RBLX', 'Roblox'),
  us('U', 'Unity Software'), us('NET', 'Cloudflare'), us('DDOG', 'Datadog'), us('SNOW', 'Snowflake'),
  us('CRWD', 'CrowdStrike'), us('ZS', 'Zscaler'), us('MDB', 'MongoDB'), us('PATH', 'UiPath'),
  us('AI', 'C3.ai'), us('ARM', 'Arm Holdings'), us('ASTS', 'AST SpaceMobile'), us('IONQ', 'IonQ'),
  us('RGTI', 'Rigetti Computing'), us('QUBT', 'Quantum Computing Inc'), us('CVNA', 'Carvana'), us('HOOD', 'Robinhood'),
  us('APP', 'AppLovin'), us('DUOL', 'Duolingo'), us('CELH', 'Celsius Holdings'), us('ONON', 'On Holding'),
];

export const TRADING_UNIVERSE: UniverseSymbol[] = [
  ...KRX_LEADERS,
  ...US_LEADERS,
  ...KRX_GROWTH,
  ...US_GROWTH,
];
