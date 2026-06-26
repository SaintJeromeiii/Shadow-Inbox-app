export type FinanceProject = 'AlphaRounds' | 'DealShield' | 'ServiceLog' | 'General';

export interface FinanceTransaction {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  category: string;
  projectName: FinanceProject;
  billingDate?: string;
  sourceNotificationId?: string | null;
  accountKey?: string;
  createdAt?: string;
}

export interface FinanceSummary {
  success?: boolean;
  accountKey: string;
  monthKey: string;
  totalMonthToDate: number;
  byProject: Record<FinanceProject, number>;
  transactionCount: number;
  transactions: FinanceTransaction[];
}
