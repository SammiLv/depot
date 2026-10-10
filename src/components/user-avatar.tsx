import { avatarColor } from "@/lib/avatar-color";

/**
 * 统一用户头像：有钉钉头像（avatarUrl）显示图片，否则回退姓氏首字 + 稳定配色。
 * className 传尺寸/圆角/字号（如 "h-9 w-9 rounded-full text-sm"），由调用方控制外观。
 */
export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className: string;
}) {
  if (avatarUrl) {
    // 图床有防盗链（带 Referer 返回 403），必须禁发 Referer
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} referrerPolicy="no-referrer" className={`${className} shrink-0 object-cover`} />;
  }
  const initial = Array.from(name.trim())[0] ?? "";
  return (
    <div className={`${className} flex shrink-0 items-center justify-center font-medium text-white ${avatarColor(name)}`}>
      {initial}
    </div>
  );
}
