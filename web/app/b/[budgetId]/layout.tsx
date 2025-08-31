import Sidebar from "../../../components/Sidebar";

export default function BudgetLayout({ children, params }: { children: React.ReactNode; params: { budgetId: string } }) {
  const { budgetId } = params;
  return (
    <div className="min-h-screen grid grid-cols-[18rem_1fr]">
      <Sidebar budgetId={budgetId} />
      <main className="p-6">
        <div className="max-w-6xl mx-auto bg-white shadow-panel rounded-lg p-4">{children}</div>
      </main>
    </div>
  );
}
