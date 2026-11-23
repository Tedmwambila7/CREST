/* CREST one-to-one audio/video calling — LiveKit. Secrets remain server-side. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://otjybdiyoqnsynjbofuj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc';
  const LIVEKIT_URL = 'wss://crest-group-calls-siyc48vs.livekit.cloud';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/crest-livekit-token';
  const LOBBY = 'crest-lobby';
  const LK = window.LivekitClient || window.LiveKitClient;
  let lobby = null, callRoom = null, identity = '', role = null, myPhone = '';
  let displayName = '', sessionSignature = '', incoming = null;
  let activeTicket = null, activeCallId = null, activeMode = null;
  let activeTargetIdentity = '', activePeerIdentity = '';
  let callJoined = false, joiningCall = false, lobbyConnecting = false;
  let localMic = true, localCamera = false, inviteTimer = null, connectTimer = null;
  const $ = id => document.getElementById(id);
  const enc = value => new TextEncoder().encode(JSON.stringify(value));
  const dec = bytes => { try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { return null; } };
  const isAdminPage = () => !!$('adminChatMessagesLog');

  function metadataOf(participant) {
    try { return JSON.parse(participant.metadata || '{}'); } catch (_) { return {}; }
  }
  function currentCredentials() {
    if (isAdminPage()) {
      if (document.body.classList.contains('locked') || sessionStorage.getItem('crestAdminOK') !== '1') return null;
      const key = sessionStorage.getItem('crestAdminKey') || '';
      if (!key) return null;
      return { role: 'admin', adminKey: key, displayName: 'CREST Teacher', phone: '', signature: 'admin:' + key };
    }
    const s = (typeof studentSession !== 'undefined' && studentSession) ? studentSession : null;
    if (!s || !s.token) return null;
    return { role: 'student', studentToken: s.token, displayName: s.name || 'Student', phone: String(s.phone || ''), signature: 'student:' + s.token };
  }
  function setStatus(message) {
    const toolbar = $('crestCallToolbarStatus');
    if (toolbar) toolbar.textContent = message;
    const status = $('crestCallStatus');
    if (status && callJoined) status.textContent = message;
  }
  function participantForPhone(phone) {
    if (!lobby || !phone) return null;
    for (const p of lobby.remoteParticipants.values()) {
      const meta = metadataOf(p);
      if (meta.role === 'student' && String(meta.phone || '') === String(phone)) return p;
    }
    return null;
  }
  function onlineAdmin() {
    if (!lobby) return null;
    for (const p of lobby.remoteParticipants.values()) {
      if (metadataOf(p).role === 'admin') return p;
    }
    return null;
  }
  function refreshToolbar() {
    const count = lobby ? lobby.remoteParticipants.size : 0;
    const online = $('crestOnlineCount');
    if (online) online.textContent = isAdminPage()
      ? count + ' CREST user' + (count === 1 ? '' : 's') + ' online'
      : (onlineAdmin() ? 'Administrator online' : 'Administrator offline');
    if (isAdminPage()) {
      const selected = $('adminChatTo') ? $('adminChatTo').value : 'all';
      const target = selected && selected !== 'all' ? participantForPhone(selected) : null;
      if ($('crestStartVoice')) $('crestStartVoice').disabled = !target || callJoined || !!activeTicket;
      if ($('crestStartVideo')) $('crestStartVideo').disabled = !target || callJoined || !!activeTicket;
      if (!target && selected !== 'all' && $('crestCallToolbarStatus')) {
        $('crestCallToolbarStatus').textContent = 'That student is not online right now.';
      }
    } else {
      const available = !!onlineAdmin() && !callJoined && !activeTicket;
      if ($('crestStartVoice')) $('crestStartVoice').disabled = !available;
      if ($('crestStartVideo')) $('crestStartVideo').disabled = !available;
    }
  }

  function addStyles() {
    if ($('crestCallStyles')) return;
    const s = document.createElement('style');
    s.id = 'crestCallStyles';
    s.textContent = [
      '#crestCallTools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.15);border-radius:12px;margin:0 0 12px;color:#cbd5e1;font:12px Poppins,Arial,sans-serif}',
      '#crestCallTools button{border:0;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer;background:#0ea5e9;color:#06121d}',
      '#crestCallTools button:disabled{opacity:.4;cursor:not-allowed}',
      '#crestCallToolbarStatus{font-size:11px;color:#94a3b8;flex:1;min-width:150px}',
      '#crestCallModal,#crestIncomingCall{position:fixed;inset:0;z-index:100500;background:rgba(2,6,23,.94);display:none;align-items:center;justify-content:center;padding:14px;font-family:Poppins,Arial,sans-serif}',
      '.crest-call-card{width:min(900px,100%);max-height:92vh;overflow:auto;background:#0b1124;border:1px solid rgba(56,189,248,.35);border-radius:18px;padding:18px;color:#e2e8f0;box-shadow:0 24px 80px #000a}',
      '.crest-call-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}',
      '#crestCallVideos{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:14px 0}',
      '.crest-call-tile{position:relative;min-height:145px;background:#020617;border:1px solid #263449;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center}',
      '.crest-call-tile video{width:100%;height:100%;max-height:330px;object-fit:cover}',
      '.crest-call-tile span{position:absolute;left:8px;bottom:8px;background:#020617c9;padding:4px 8px;border-radius:6px;font-size:11px}',
      '#crestCallControls,.crest-incoming-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:14px}',
      '#crestCallControls button,.crest-incoming-actions button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer;background:#1e293b;color:#fff}',
      '#crestCallControls button.danger,.crest-incoming-actions button.danger{background:#dc2626}',
      '.crest-incoming-actions button.primary{background:#16a34a}',
      '@media(max-width:520px){#crestCallTools{font-size:11px}#crestCallTools button{padding:8px 10px}.crest-call-card{padding:13px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function addCallUI() {
    if (!$('crestCallModal')) {
      const modal = document.createElement('div');
      modal.id = 'crestCallModal';
      modal.innerHTML = '<div class="crest-call-card"><div class="crest-call-head"><div><div style="font-weight:800;font-size:17px">CREST Call</div><div id="crestCallStatus" style="margin-top:4px;color:#94a3b8">Connecting…</div></div><div id="crestCallModeLabel" style="font-size:11px;color:#7dd3fc">LIVE CALL</div></div><div id="crestCallVideos"></div><div id="crestCallControls"><button id="crestMicBtn" type="button">Mute microphone</button><button id="crestCameraBtn" type="button">Turn camera on</button><button id="crestLeaveBtn" class="danger" type="button">End call</button></div><p style="font-size:10px;color:#94a3b8;text-align:center;margin:12px 0 0">Your call is live and is not recorded by CREST.</p></div>';
      document.body.appendChild(modal);
    }
    if (!$('crestIncomingCall')) {
      const inc = document.createElement('div');
      inc.id = 'crestIncomingCall';
      inc.innerHTML = '<div class="crest-call-card" style="max-width:420px;text-align:center"><div style="font-size:30px;margin:4px 0 12px">📞</div><div id="crestIncomingTitle" style="font-size:19px;font-weight:800">Incoming call</div><div id="crestIncomingText" style="font-size:13px;color:#cbd5e1;margin-top:8px">Someone is calling you.</div><div class="crest-incoming-actions"><button id="crestAcceptCall" class="primary" type="button">Accept</button><button id="crestDeclineCall" class="danger" type="button">Decline</button></div></div>';
      document.body.appendChild(inc);
    }
    $('crestMicBtn').onclick = toggleMic;
    $('crestCameraBtn').onclick = toggleCamera;
    $('crestLeaveBtn').onclick = () => leaveCall(true);
    $('crestAcceptCall').onclick = acceptIncoming;
    $('crestDeclineCall').onclick = declineIncoming;
  }

  function setupCallTools() {
    if ($('crestCallTools')) return;
    const tools = document.createElement('div');
    tools.id = 'crestCallTools';
    if (isAdminPage()) {
      tools.innerHTML = '<span id="crestOnlineCount">Checking online users…</span><button id="crestStartVoice" type="button" disabled>☎ Audio call selected student</button><button id="crestStartVideo" type="button" disabled>▣ Video call selected student</button><span id="crestCallToolbarStatus">Choose an online student in “Reply to” to call.</span>';
    } else {
      tools.innerHTML = '<span id="crestOnlineCount">Checking administrator…</span><button id="crestStartVoice" type="button" disabled>☎ Call admin (audio)</button><button id="crestStartVideo" type="button" disabled>▣ Call admin (video)</button><span id="crestCallToolbarStatus">You can call the CREST administrator when online.</span>';
    }
    const anchor = isAdminPage() ? $('adminChatMessagesLog') : $('chatMessagesLog');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(tools, anchor);
    if ($('crestStartVoice')) $('crestStartVoice').onclick = () => startDirectCall('audio');
    if ($('crestStartVideo')) $('crestStartVideo').onclick = () => startDirectCall('video');
    const recipient = $('adminChatTo');
    if (recipient) recipient.addEventListener('change', refreshToolbar);
  }

  async function requestToken(action, extra) {
    const c = currentCredentials();
    if (!c) throw new Error('Please sign in again to use CREST calls.');
    const body = Object.assign({
      action: action, role: c.role, adminKey: c.adminKey || null,
      studentToken: c.studentToken || null, displayName: c.displayName,
      identity: identity
    }, extra || {});
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Calling service could not verify your CREST session.');
    return data;
  }

  async function connectLobby() {
    if (!LK) { setStatus('The calling library did not load. Refresh the page and try again.'); return; }
    const c = currentCredentials();
    if (!c) {
      if (lobby) { try { await lobby.disconnect(); } catch (_) {} lobby = null; }
      sessionSignature = '';
      refreshToolbar();
      return;
    }
    if (lobbyConnecting) return;
    if (lobby && sessionSignature === c.signature) {
      const state = lobby.state;
      if (state === LK.ConnectionState.Connected || state === LK.ConnectionState.Connecting ||
          state === LK.ConnectionState.Reconnecting || state === LK.ConnectionState.SignalReconnecting) return;
    }
    lobbyConnecting = true;
    try {
      if (lobby) { try { await lobby.disconnect(); } catch (_) {} lobby = null; }
      sessionSignature = c.signature;
      role = c.role;
      displayName = c.displayName;
      myPhone = c.phone || '';
      identity = 'u_' + crypto.randomUUID();
      const grant = await requestToken('lobby', { room: LOBBY });
      if (!grant.token) throw new Error('The calling service did not return a lobby token.');
      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      lobby = room;
      room.on(LK.RoomEvent.DataReceived, onLobbyData);
      room.on(LK.RoomEvent.ParticipantConnected, refreshToolbar);
      room.on(LK.RoomEvent.ParticipantDisconnected, refreshToolbar);
      room.on(LK.RoomEvent.Disconnected, refreshToolbar);
      await room.connect(grant.serverUrl || LIVEKIT_URL, grant.token);
      if (lobby !== room) { try { await room.disconnect(); } catch (_) {} return; }
      refreshToolbar();
      setStatus(role === 'admin' ? 'You are online and ready to call a student.' : 'You are online and ready to call the administrator.');
    } catch (error) {
      console.error('CREST calling lobby failed:', error);
      setStatus('Calling is not ready: ' + (error.message || String(error)));
      if ($('crestStartVoice')) $('crestStartVoice').disabled = true;
      if ($('crestStartVideo')) $('crestStartVideo').disabled = true;
    } finally { lobbyConnecting = false; }
  }

  async function sendLobby(message) {
    if (!lobby || lobby.state !== LK.ConnectionState.Connected) throw new Error('You are not connected to CREST calling.');
    await lobby.localParticipant.publishData(enc(message), { reliable: true });
  }

  async function startDirectCall(mode) {
    if (!lobby || callJoined || activeTicket) return;
    let target = null, targetRole = '', targetPhone = '';
    if (role === 'admin') {
      const select = $('adminChatTo');
      targetPhone = select ? String(select.value || '') : '';
      if (!targetPhone || targetPhone === 'all') {
        setStatus('Choose one student in “Reply to” before starting a call.');
        return;
      }
      target = participantForPhone(targetPhone);
      targetRole = 'student';
      if (!target) { setStatus('That student is not online.'); refreshToolbar(); return; }
    } else {
      target = onlineAdmin();
      targetRole = 'admin';
      if (!target) { setStatus('The administrator is offline right now.'); refreshToolbar(); return; }
    }
    try {
      setStatus('Calling ' + (target.name || (targetRole === 'admin' ? 'the administrator' : 'the student')) + '…');
      const invite = await requestToken('create', { mode: mode, targetRole: targetRole, targetPhone: targetPhone || null });
      activeTicket = invite.ticket;
      activeCallId = invite.callId;
      activeMode = mode;
      activeTargetIdentity = target.identity;
      await sendLobby({
        type: 'call-invite', callId: invite.callId, ticket: invite.ticket, mode: mode,
        targetRole: targetRole, targetPhone: targetPhone || null,
        caller: displayName, callerRole: role, at: Date.now()
      });
      setStatus('Ringing ' + (target.name || (targetRole === 'admin' ? 'the administrator' : 'the student')) + '…');
      inviteTimer = setTimeout(() => {
        if (!callJoined && activeTicket) {
          sendLobby({ type: 'call-cancel', callId: activeCallId }).catch(() => {});
          resetOutgoing();
          setStatus('No answer. You can try calling again.');
          refreshToolbar();
        }
      }, 45000);
      refreshToolbar();
    } catch (error) {
      resetOutgoing();
      setStatus('Could not start call: ' + error.message);
      refreshToolbar();
    }
  }

  function resetOutgoing() {
    if (inviteTimer) clearTimeout(inviteTimer);
    inviteTimer = null;
    activeTicket = null; activeCallId = null; activeMode = null; activeTargetIdentity = '';
  }

  function showIncoming(message, participant) {
    incoming = Object.assign({}, message, { callerIdentity: participant.identity });
    $('crestIncomingTitle').textContent = 'Incoming ' + (message.mode === 'video' ? 'video' : 'audio') + ' call';
    $('crestIncomingText').textContent = (participant.name || message.caller || 'CREST user') + ' is calling you. Accept or decline?';
    $('crestIncomingCall').style.display = 'flex';
    setStatus('Incoming call from ' + (participant.name || 'CREST user') + '.');
  }

  function onLobbyData(payload, participant) {
    const message = dec(payload);
    if (!message || !participant) return;
    const sender = metadataOf(participant);
    if (message.type === 'call-invite' && message.targetRole === role &&
        (role !== 'student' || String(message.targetPhone || '') === String(myPhone)) &&
        ((role === 'student' && sender.role === 'admin') || (role === 'admin' && sender.role === 'student')) &&
        !callJoined && !joiningCall && !incoming) {
      showIncoming(message, participant);
      return;
    }
    if (message.type === 'call-accept' && message.callId === activeCallId &&
        participant.identity === activeTargetIdentity && activeTicket && !callJoined && !joiningCall) {
      if (inviteTimer) clearTimeout(inviteTimer);
      inviteTimer = null;
      activePeerIdentity = participant.identity;
      joinCall(activeTicket, activeCallId, activeMode, activePeerIdentity).catch(error => {
        setStatus('Could not connect the call: ' + error.message);
      });
      return;
    }
    if (message.type === 'call-decline' && message.callId === activeCallId &&
        participant.identity === activeTargetIdentity) {
      resetOutgoing();
      setStatus((participant.name || 'The other person') + ' declined your call.');
      refreshToolbar();
      return;
    }
    if (message.type === 'call-cancel' && incoming &&
        message.callId === incoming.callId && participant.identity === incoming.callerIdentity) {
      incoming = null;
      $('crestIncomingCall').style.display = 'none';
      setStatus('The caller cancelled the invitation.');
      return;
    }
    if (message.type === 'call-end' && message.callId === activeCallId &&
        participant.identity === activePeerIdentity) {
      leaveCall(false);
    }
  }

  async function acceptIncoming() {
    if (!incoming) return;
    const invite = incoming;
    incoming = null;
    $('crestIncomingCall').style.display = 'none';
    try {
      activeTicket = invite.ticket;
      activeCallId = invite.callId;
      activeMode = invite.mode;
      activePeerIdentity = invite.callerIdentity;
      await sendLobby({ type: 'call-accept', callId: invite.callId });
      await joinCall(invite.ticket, invite.callId, invite.mode, invite.callerIdentity);
    } catch (error) {
      setStatus('Could not join the call: ' + error.message);
      resetOutgoing();
    }
  }

  async function declineIncoming() {
    if (incoming) {
      sendLobby({ type: 'call-decline', callId: incoming.callId }).catch(() => {});
    }
    incoming = null;
    $('crestIncomingCall').style.display = 'none';
    setStatus('You declined the call.');
    refreshToolbar();
  }

  async function joinCall(ticket, callId, mode, peerIdentity) {
    if (callJoined || joiningCall) return;
    joiningCall = true;
    try {
      const grant = await requestToken('join', { ticket: ticket });
      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      callRoom = room;
      room.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => attachRemoteTrack(track, participant));
      room.on(LK.RoomEvent.TrackUnsubscribed, track => detachTrack(track));
      room.on(LK.RoomEvent.ParticipantDisconnected, participant => {
        if (participant.identity === activePeerIdentity) leaveCall(false);
        else updateCallStatus();
      });
      room.on(LK.RoomEvent.Disconnected, () => { if (callJoined) leaveCall(false); });
      await room.connect(grant.serverUrl || LIVEKIT_URL, grant.token);
      activeTicket = ticket;
      activeCallId = callId;
      activeMode = mode;
      activePeerIdentity = peerIdentity;
      callJoined = true;
      $('crestCallModal').style.display = 'flex';
      $('crestLeaveBtn').textContent = 'End call';
      $('crestCallModeLabel').textContent = mode === 'video' ? 'VIDEO CALL' : 'AUDIO CALL';
      $('crestCameraBtn').style.display = mode === 'video' ? 'inline-block' : 'none';
      $('crestCallVideos').innerHTML = '';
      addLocalTile();
      localMic = true;
      localCamera = false;
      await room.localParticipant.setMicrophoneEnabled(true);
      $('crestMicBtn').textContent = 'Mute microphone';
      $('crestCameraBtn').textContent = 'Turn camera on';
      updateCallStatus();
      refreshToolbar();
    } catch (error) {
      if (callRoom) { try { await callRoom.disconnect(); } catch (_) {} callRoom = null; }
      throw error;
    } finally { joiningCall = false; }
  }

  function addLocalTile() {
    const tile = document.createElement('div');
    tile.className = 'crest-call-tile';
    tile.id = 'crestLocalTile';
    const label = document.createElement('span');
    label.textContent = 'You';
    tile.appendChild(label);
    $('crestCallVideos').appendChild(tile);
  }
  function attachRemoteTrack(track, participant) {
    if (track.kind === LK.Track.Kind.Audio) {
      const element = track.attach();
      element.autoplay = true;
      element.style.display = 'none';
      $('crestCallVideos').appendChild(element);
      return;
    }
    let tile = $('crestTile_' + participant.sid);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'crest-call-tile';
      tile.id = 'crestTile_' + participant.sid;
      const label = document.createElement('span');
      label.textContent = participant.name || 'CREST participant';
      tile.appendChild(label);
      $('crestCallVideos').appendChild(tile);
    }
    tile.insertBefore(track.attach(), tile.firstChild);
  }
  function detachTrack(track) { track.detach().forEach(element => element.remove()); }
  function updateCallStatus() {
    const count = callRoom ? callRoom.remoteParticipants.size + 1 : 0;
    if ($('crestCallStatus')) $('crestCallStatus').textContent =
      count > 1 ? 'Connected · ' + count + ' people' : 'Connected · waiting for the other person';
  }
  async function toggleMic() {
    if (!callRoom) return;
    try {
      localMic = !localMic;
      await callRoom.localParticipant.setMicrophoneEnabled(localMic);
      $('crestMicBtn').textContent = localMic ? 'Mute microphone' : 'Unmute microphone';
    } catch (error) { setStatus('Microphone control failed: ' + error.message); }
  }
  async function toggleCamera() {
    if (!callRoom || activeMode !== 'video') return;
    try {
      localCamera = !localCamera;
      await callRoom.localParticipant.setCameraEnabled(localCamera);
      const tile = $('crestLocalTile');
      if (localCamera) {
        const publication = callRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
        if (publication && publication.track && tile) {
          const label = tile.querySelector('span');
          tile.insertBefore(publication.track.attach(), label || null);
        }
      } else if (tile) {
        tile.querySelectorAll('video').forEach(video => video.remove());
      }
      $('crestCameraBtn').textContent = localCamera ? 'Turn camera off' : 'Turn camera on';
    } catch (error) { setStatus('Camera control failed: ' + error.message); }
  }
  async function leaveCall(notify) {
    const oldId = activeCallId;
    const oldPeer = activePeerIdentity;
    callJoined = false;
    joiningCall = false;
    if (notify && oldId && lobby) sendLobby({ type: 'call-end', callId: oldId }).catch(() => {});
    if (inviteTimer) clearTimeout(inviteTimer);
    inviteTimer = null;
    if (callRoom) {
      try { await callRoom.localParticipant.setMicrophoneEnabled(false); } catch (_) {}
      try { await callRoom.localParticipant.setCameraEnabled(false); } catch (_) {}
      try { await callRoom.disconnect(); } catch (_) {}
    }
    callRoom = null;
    activeTicket = null; activeCallId = null; activeMode = null;
    activeTargetIdentity = ''; activePeerIdentity = '';
    if ($('crestCallModal')) $('crestCallModal').style.display = 'none';
    if ($('crestCallVideos')) $('crestCallVideos').innerHTML = '';
    if ($('crestIncomingCall')) $('crestIncomingCall').style.display = 'none';
    if (oldPeer) setStatus('Call ended. You can call again.');
    refreshToolbar();
  }

  function boot() {
    addStyles();
    addCallUI();
    setupCallTools();
    connectLobby();
    connectTimer = setInterval(() => {
      const c = currentCredentials();
      if (!c && lobby) {
        lobby.disconnect().catch(() => {});
        lobby = null;
        sessionSignature = '';
        refreshToolbar();
      } else if (LK && c && (!lobby || sessionSignature !== c.signature ||
          lobby.state !== LK.ConnectionState.Connected)) {
        connectLobby();
      } else {
        refreshToolbar();
      }
    }, 4000);
  }
  window.addEventListener('pagehide', () => {
    try { if (callRoom) callRoom.disconnect(); } catch (_) {}
    try { if (lobby) lobby.disconnect(); } catch (_) {}
    if (connectTimer) clearInterval(connectTimer);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();