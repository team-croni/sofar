/** 앱이 보여 주는 프로필 이미지는 사용자가 직접 올린 것(avatars 버킷)뿐이다. Google 사진은 쓰지 않는다 */
export function uploadedAvatarUrl(value: unknown): string | null {
  return typeof value === 'string' &&
    value.includes('/storage/v1/object/public/avatars/')
    ? value
    : null;
}

/** avatars/{userId}/ 아래 올린 이미지를 모두 지운다 */
export async function removeUserAvatarFiles(
  url: string,
  headers: Record<string, string>,
  userId: string,
): Promise<number> {
  const listRes = await fetch(`${url}/storage/v1/object/list/avatars`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prefix: userId, limit: 100 }),
  });
  if (!listRes.ok) return 0;
  const files = (await listRes.json()) as Array<{ name: string }>;
  if (!Array.isArray(files) || files.length === 0) return 0;
  await fetch(`${url}/storage/v1/object/avatars`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      prefixes: files.map((f) => `${userId}/${f.name}`),
    }),
  });
  return files.length;
}
