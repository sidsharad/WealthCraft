import { getAdminUsersData } from "./data";

export const dynamic = "force-dynamic";

export default async function UsersDashboard() {
  const data = await getAdminUsersData();

  return (
    <div className="container mx-auto py-10 space-y-8">
      <h1 className="text-4xl font-bold tracking-tight">Users Analytics</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Total Users</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.summary.totalUsers}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Users With Completed Games</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.summary.usersWithCompletedGames}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Active Users (30 Days)</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.summary.activeUsers}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="flex flex-col space-y-1.5 p-6">
          <h3 className="font-semibold leading-none tracking-tight">User Data</h3>
        </div>
        <div className="p-6 pt-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Email</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Signup Date</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Last Game Played</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Games Played</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Games Completed</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Wins</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Win Rate</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">{user.name}</td>
                    <td className="p-4 align-middle text-muted-foreground">{user.email}</td>
                    <td className="p-4 align-middle text-muted-foreground">{new Date(user.signupDate).toLocaleDateString()}</td>
                    <td className="p-4 align-middle text-muted-foreground">{user.lastGamePlayed ? new Date(user.lastGamePlayed).toLocaleDateString() : "Never"}</td>
                    <td className="p-4 align-middle text-right">{user.gamesPlayed}</td>
                    <td className="p-4 align-middle text-right">{user.gamesCompleted}</td>
                    <td className="p-4 align-middle text-right">{user.wins}</td>
                    <td className="p-4 align-middle text-right">{user.winRate}%</td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td colSpan={8} className="p-4 align-middle text-center text-muted-foreground">No data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
