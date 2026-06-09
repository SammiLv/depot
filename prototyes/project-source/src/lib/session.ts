import { mockUsers, type MockUser } from "./mock-data";

const KEY = "mvp.currentUserId";

export function getCurrentUser(): MockUser {
  if (typeof window === "undefined") return mockUsers[1];
  const id = localStorage.getItem(KEY);
  return mockUsers.find((u) => u.id === id) ?? mockUsers[1];
}

export function setCurrentUser(id: string) {
  localStorage.setItem(KEY, id);
}

export function logout() {
  localStorage.removeItem(KEY);
}

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(KEY);
}
