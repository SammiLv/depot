import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";
import EmployeeProfileContent from "./profile-content";

export default async function EmployeeProfilesPage() {
  const user = await requireCurrentUser();
  const data = await getEmployeeProfileManagementData(user);
  if (!data.canEdit) redirect("/talent");
  return <EmployeeProfileContent data={data} />;
}
