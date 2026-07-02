import { useQuery } from '@tanstack/react-query';
import { getAmazonDashboard } from '../../api/amazon.api';

export const AMAZON_DASHBOARD_KEY = ['amazon', 'dashboard'] as const;

export function useAmazonDashboard() {
  return useQuery({ queryKey: AMAZON_DASHBOARD_KEY, queryFn: getAmazonDashboard });
}
