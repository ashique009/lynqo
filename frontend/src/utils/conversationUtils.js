export const mergeConversations = (prevConvs = [], incomingConvs = []) => {
  const convMap = new Map();

  for (const inc of incomingConvs) {
    convMap.set(inc.id, { ...inc });
  }

  for (const prev of prevConvs) {
    const existing = convMap.get(prev.id);
    if (!existing) {
      convMap.set(prev.id, prev);
    } else {
      const prevTime = new Date(prev.updated_at || prev.last_message?.created_at || 0).getTime();
      const existTime = new Date(existing.updated_at || existing.last_message?.created_at || 0).getTime();

      if (prevTime > existTime) {
        // prev has a newer update from WebSocket
        convMap.set(prev.id, {
          ...existing,
          ...prev,
          last_message: prev.last_message || existing.last_message,
          unread_count: prev.unread_count !== undefined ? prev.unread_count : existing.unread_count,
          updated_at: prev.updated_at,
        });
      }
    }
  }

  return Array.from(convMap.values()).sort((a, b) => {
    const timeA = new Date(a.updated_at || a.last_message?.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.last_message?.created_at || 0).getTime();
    return timeB - timeA;
  });
};
