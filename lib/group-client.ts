/** Backend `is_group_parent_client`: GROUP / COOPERATIVE / SME with no parent link. */

const GROUP_PARENT_TYPES = new Set(['GROUP', 'COOPERATIVE', 'SME']);

export function isGroupParentClient(client: {
  client_type?: string | null;
  parent_client_id?: string | null;
}): boolean {
  const t = (client.client_type ?? '').toUpperCase();
  if (!GROUP_PARENT_TYPES.has(t)) return false;
  const pid = client.parent_client_id;
  if (pid != null && String(pid).trim() !== '') return false;
  return true;
}
