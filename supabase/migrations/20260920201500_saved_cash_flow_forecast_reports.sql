alter table public.saved_financial_reports
drop constraint if exists saved_financial_reports_report_type_check;

alter table public.saved_financial_reports
add constraint saved_financial_reports_report_type_check
check (
  report_type in (
    'income-expense',
    'fixed-expenses',
    'period-comparison',
    'asset-performance',
    'asset-performance-general',
    'net-worth-evolution',
    'cash-flow-forecast'
  )
);
