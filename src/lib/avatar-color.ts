const avatarPalette = [
  "bg-blue-500", "bg-teal-500", "bg-green-500", "bg-orange-500",
  "bg-red-500", "bg-cyan-600", "bg-indigo-500", "bg-pink-500", "bg-amber-500",
];

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}
