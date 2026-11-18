const STATUS_PRIORITY = { sending: 1, sent: 2, delivered: 3, seen: 4 };

export const mergeMessages = (existingMessages = [], incomingMessages = []) => {
  const mergedMap = new Map();
  const clientMsgIdToKey = new Map();

  const getKey = (m) => {
    if (m.client_message_id) return `cli_${m.client_message_id}`;
    if (m.id && !String(m.id).startsWith('temp-')) return `id_${m.id}`;
    return `temp_${m.id || Math.random()}`;
  };

  const mergeTwo = (base, incoming) => {
    const s1 = base.status;
    const s2 = incoming.status;
    const p1 = STATUS_PRIORITY[s1] || 0;
    const p2 = STATUS_PRIORITY[s2] || 0;
    const bestStatus = p1 >= p2 ? s1 : s2;

    const bestId = incoming.id && !String(incoming.id).startsWith('temp-')
      ? incoming.id
      : base.id;

    const clientMsgId = incoming.client_message_id || base.client_message_id;

    return {
      ...base,
      ...incoming,
      id: bestId,
      client_message_id: clientMsgId,
      status: bestStatus,
      is_read: base.is_read || incoming.is_read || bestStatus === 'seen',
    };
  };

  for (const msg of existingMessages) {
    const key = getKey(msg);
    mergedMap.set(key, msg);
    if (msg.client_message_id) {
      clientMsgIdToKey.set(msg.client_message_id, key);
    }
  }

  for (const inc of incomingMessages) {
    let existingKey = null;

    if (inc.client_message_id && clientMsgIdToKey.has(inc.client_message_id)) {
      existingKey = clientMsgIdToKey.get(inc.client_message_id);
    } else if (inc.id && !String(inc.id).startsWith('temp-')) {
      const idKey = `id_${inc.id}`;
      if (mergedMap.has(idKey)) {
        existingKey = idKey;
      } else {
        for (const [k, v] of mergedMap.entries()) {
          if (v.client_message_id && inc.client_message_id && v.client_message_id === inc.client_message_id) {
            existingKey = k;
            break;
          }
          if (v.id && String(v.id) === String(inc.id)) {
            existingKey = k;
            break;
          }
        }
      }
    }

    if (existingKey) {
      const base = mergedMap.get(existingKey);
      const updated = mergeTwo(base, inc);
      mergedMap.delete(existingKey);
      const newKey = getKey(updated);
      mergedMap.set(newKey, updated);
      if (updated.client_message_id) {
        clientMsgIdToKey.set(updated.client_message_id, newKey);
      }
    } else {
      const key = getKey(inc);
      mergedMap.set(key, inc);
      if (inc.client_message_id) {
        clientMsgIdToKey.set(inc.client_message_id, key);
      }
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = new Date(a.created_at).getTime() || 0;
    const timeB = new Date(b.created_at).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;

    const idA = Number(a.id);
    const idB = Number(b.id);
    const hasRealA = !isNaN(idA) && !String(a.id).startsWith('temp-');
    const hasRealB = !isNaN(idB) && !String(b.id).startsWith('temp-');
    if (hasRealA && hasRealB) return idA - idB;
    if (hasRealA && !hasRealB) return -1;
    if (!hasRealA && hasRealB) return 1;

    return String(a.client_message_id || a.id).localeCompare(String(b.client_message_id || b.id));
  });
};
