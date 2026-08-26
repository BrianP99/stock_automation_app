import React, { createContext, useContext, useState } from 'react';
import { StockChartModal } from '../components/StockChartModal';

interface ChartModalTarget {
  symbol: string;
  name: string;
  avgBuyPrice?: number;
}

export interface HoldingSummary {
  symbol: string;
  name: string;
  avgBuyPrice?: number;
}

type ChartModalState =
  | { kind: 'closed' }
  | { kind: 'picker'; holdings: HoldingSummary[] }
  | ({ kind: 'symbol' } & ChartModalTarget);

interface ChartModalContextValue {
  openChart: (target: ChartModalTarget) => void;
  openPicker: (holdings?: HoldingSummary[]) => void;
}

const ChartModalContext = createContext<ChartModalContextValue>({ openChart: () => {}, openPicker: () => {} });

export const useChartModal = () => useContext(ChartModalContext);

/** Renders the shared chart modal once at the top of the tree; any descendant can open it via useChartModal(). */
export const ChartModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ChartModalState>({ kind: 'closed' });

  return (
    <ChartModalContext.Provider
      value={{
        openChart: (target) => setState({ kind: 'symbol', ...target }),
        openPicker: (holdings = []) => setState({ kind: 'picker', holdings }),
      }}
    >
      {children}
      {state.kind === 'symbol' && (
        <StockChartModal
          symbol={state.symbol}
          name={state.name}
          avgBuyPrice={state.avgBuyPrice}
          onClose={() => setState({ kind: 'closed' })}
        />
      )}
      {state.kind === 'picker' && <StockChartModal holdings={state.holdings} onClose={() => setState({ kind: 'closed' })} />}
    </ChartModalContext.Provider>
  );
};
