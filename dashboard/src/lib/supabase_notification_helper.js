/**
 * Subscribe to new notifications for a user.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(userId, onNotification) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) onNotification(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
