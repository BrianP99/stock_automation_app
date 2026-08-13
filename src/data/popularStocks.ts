import { Stock } from '../types';

export const POPULAR_STOCKS: Stock[] = [
  {
    symbol: '005930',
    name: '삼성전자',
    category: '국내 반도체/대형주',
    currentPrice: 72500,
    changePercent: 1.68,
    marketCap: '432조원',
    currency: 'KRW',
    description: '대한민국 대표 반도체 및 스마트폰 제조 기업 (가장 안전한 국민주)'
  },
  {
    symbol: '000660',
    name: 'SK하이닉스',
    category: '국내 AI 반도체',
    currentPrice: 184500,
    changePercent: 2.79,
    marketCap: '134조원',
    currency: 'KRW',
    description: '고성능 HBM 반도체 글로벌 선도 기업'
  },
  {
    symbol: '005380',
    name: '현대차',
    category: '국내 자동차/수소',
    currentPrice: 245000,
    changePercent: 0.82,
    marketCap: '51조원',
    currency: 'KRW',
    description: '전기차 및 대표 글로벌 자동차 완성차 기업'
  },
  {
    symbol: '035420',
    name: 'NAVER',
    category: '국내 IT/플랫폼',
    currentPrice: 178000,
    changePercent: -0.56,
    marketCap: '29조원',
    currency: 'KRW',
    description: '대한민국 1위 포털 검색 및 AI IT 플랫폼 기업'
  },
  {
    symbol: '035720',
    name: '카카오',
    category: '국내 모바일/플랫폼',
    currentPrice: 42500,
    changePercent: 1.19,
    marketCap: '18조원',
    currency: 'KRW',
    description: '국민 모바일 메신저 카카오톡 기반 플랫폼'
  },
  {
    symbol: 'NVDA',
    name: '엔비디아 (Nvidia)',
    category: '미국 AI 그래픽/칩',
    currentPrice: 180, // Seed value in native USD; overwritten by a live quote on load.
    changePercent: 3.45,
    marketCap: '3.1조 달러',
    currency: 'USD',
    description: '글로벌 AI 혁신을 이끄는 세계 1위 반도체 설계 기업'
  },
  {
    symbol: 'AAPL',
    name: '애플 (Apple)',
    category: '미국 대형 기술주',
    currentPrice: 230, // Seed value in native USD; overwritten by a live quote on load.
    changePercent: 0.95,
    marketCap: '3.4조 달러',
    currency: 'USD',
    description: '아이폰 및 글로벌 생태계를 보유한 세계 최대 IT 기업'
  },
  {
    symbol: 'TSLA',
    name: '테슬라 (Tesla)',
    category: '미국 전기차/자율주행',
    currentPrice: 250, // Seed value in native USD; overwritten by a live quote on load.
    changePercent: -1.24,
    marketCap: '7800억 달러',
    currency: 'USD',
    description: '세계 대표 전기차 및 로봇 자율주행 AI 기업'
  }
];

export const PRESET_AMOUNTS = [
  { label: '10 만원', value: 100000 },
  { label: '50 만원', value: 500000 },
  { label: '100 만원', value: 1000000 },
  { label: '300 만원', value: 3000000 },
  { label: '500 만원', value: 5000000 },
  { label: '1,000 만원', value: 10000000 },
];
