export function formatPrice(value: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}
