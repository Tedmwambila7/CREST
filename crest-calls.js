/* CREST group calling — LiveKit client. API secrets stay in Supabase Edge Function secrets. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://otjybdiyoqnsynjbofuj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90anliZGl5b3Fuc3luamJvZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk1OTgsImV4cCI6MjEwODA2NTU5OH0.itwB7UrJNSNIGj2VN82PniqX9fccquf0d9fBwGB05Jc';
  const LIVEKIT_URL = 'wss://crest-group-calls-siyc48vs.livekit.cloud';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/crest-livekit-token';
  const LOBBY = 'crest-lobby';
  const LK = window.LivekitClient;
  let lobby = null, callRoom = null, identity = null, sessionSignature = '', role = null;
  let displayName = '', activeTicket = null, activeCallId = null, activeMode = null;
  let incoming = null, onlineCount = 0, callJoined = false, joiningCall = false, localMic = true, localCamera = true;
  let connectTimer = null, inviteTimer = null, invitePollTimer = null;
  let lobbyConnecting = false;
  const $ = id => document.getElementById(id);
  const enc = value => new TextEncoder().encode(JSON.stringify(value));
  const dec = bytes => { try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { return null; } };
  const randomId = () => 'u_' + crypto.randomUUID();
  const isAdminPage = () => !!$('adminChatMessagesLog');

  function addStyles() {
    if ($('crestCallStyles')) return;
    const s = document.createElement('style'); s.id = 'crestCallStyles';
    s.textContent = `
      #crestCallTools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.15);border-radius:12px;margin:0 0 12px;color:#cbd5e1;font:12px Poppins,Arial,sans-serif}
      #crestCallTools button{border:0;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer;background:#0ea5e9;color:#06121d}
      #crestCallTools button.secondary{background:#1e293b;color:#e2e8f0;border:1px solid #334155}
      #crestCallTools button:disabled{opacity:.45;cursor:not-allowed}
      #crestCallStatus{font-size:11px;color:#94a3b8;flex:1;min-width:120px}
      #crestCallModal,#crestIncomingCall{position:fixed;inset:0;z-index:100500;background:rgba(2,6,23,.92);display:none;align-items:center;justify-content:center;padding:14px;font-family:Poppins,Arial,sans-serif}
      .crest-call-card{width:min(900px,100%);max-height:92vh;overflow:auto;background:#0b1124;border:1px solid rgba(56,189,248,.35);border-radius:18px;padding:18px;color:#e2e8f0;box-shadow:0 24px 80px #000a}
      .crest-call-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      #crestCallVideos{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:14px 0}
      .crest-call-tile{position:relative;min-height:145px;background:#020617;border:1px solid #263449;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .crest-call-tile video{width:100%;height:100%;max-height:330px;object-fit:cover}
      .crest-call-tile span{position:absolute;left:8px;bottom:8px;background:#020617c9;padding:4px 8px;border-radius:6px;font-size:11px}
      #crestCallControls{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:14px}
      #crestCallControls button,.crest-incoming-actions button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer;background:#1e293b;color:#fff}
      #crestCallControls button.danger,.crest-incoming-actions button.danger{background:#dc2626}
      #crestCallControls button.primary,.crest-incoming-actions button.primary{background:#16a34a}
      .crest-incoming-actions{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}
      @media(max-width:520px){#crestCallTools{font-size:11px}#crestCallTools button{padding:8px 10px}.crest-call-card{padding:13px}}
    `;
    document.head.appendChild(s);
  }

  function addCallUI() {
    if (!$('crestCallModal')) {
      const modal = document.createElement('div'); modal.id = 'crestCallModal';
      modal.innerHTML = `<div class="crest-call-card"><div class="crest-call-head"><div><div style="font-weight:800;font-size:17px">CREST Group Call</div><div id="crestCallStatus" style="margin-top:4px">Connecting…</div></div><div id="crestCallModeLabel" style="font-size:11px;color:#7dd3fc">LiveKit</div></div><div id="crestCallVideos"></div><div id="crestCallControls"><button id="crestMicBtn" type="button">Mute microphone</button><button id="crestCameraBtn" type="button">Turn camera off</button><button id="crestLeaveBtn" class="danger" type="button">Leave call</button></div><p style="font-size:10px;color:#94a3b8;text-align:center;margin:12px 0 0">Calls are live and are not recorded by CREST. Only share what you are comfortable sharing.</p></div>`;
      document.body.appendChild(modal);
    }
    if (!$('crestIncomingCall')) {
      const inc = document.createElement('div'); inc.id = 'crestIncomingCall';
      inc.innerHTML = `<div class="crest-call-card" style="max-width:420px;text-align:center"><div style="font-size:30px;margin:4px 0 12px">📞</div><div style="font-size:19px;font-weight:800">Incoming CREST group call</div><div id="crestIncomingText" style="font-size:13px;color:#cbd5e1;margin-top:8px">Your teacher is inviting you to join.</div><div class="crest-incoming-actions"><button id="crestAcceptCall" class="primary" type="button">Accept</button><button id="crestDeclineCall" class="danger" type="button">Decline</button></div></div>`;
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
    const tools = document.createElement('div'); tools.id = 'crestCallTools';
    if (isAdminPage()) {
      tools.innerHTML = `<span id="crestOnlineCount">Checking who is online…</span><button id="crestStartVoice" type="button">☎ Start voice call</button><button id="crestStartVideo" type="button">▣ Start video call</button><span id="crestCallToolbarStatus">Calls are available when you are online.</span>`;
    } else {
      tools.innerHTML = `<span style="color:#7dd3fc;font-weight:700">CREST CALLING</span><span id="crestOnlineCount">Connecting…</span><span id="crestCallToolbarStatus">Waiting for a teacher's group call invitation.</span>`;
    }
    const anchor = isAdminPage() ? $('adminChatMessagesLog') : $('chatMessagesLog');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(tools, anchor);
    if ($('crestStartVoice')) $('crestStartVoice').onclick = () => startGroupCall('audio');
    if ($('crestStartVideo')) $('crestStartVideo').onclick = () => startGroupCall('video');
  }

  function setStatus(text) { const el = $('crestCallToolbarStatus'); if (el) el.textContent = text; const call = $('crestCallStatus'); if (call && callJoined) call.textContent = text; }
  function currentCredentials() {
    if (isAdminPage()) {
      if (document.body.classList.contains('locked') || sessionStorage.getItem('crestAdminOK') !== '1') return null;
      const key = sessionStorage.getItem('crestAdminKey') || '';
      if (!key) return null;
      return { role: 'admin', adminKey: key, displayName: 'CREST Teacher', signature: 'admin:' + key };
    }
    const s = (typeof studentSession !== 'undefined' && studentSession) ? studentSession : null;
    if (!s || !s.token) return null;
    return { role: 'student', studentToken: s.token, displayName: s.name || 'Student', signature: 'student:' + s.token };
  }

  async function requestToken(action, extra) {
    const c = currentCredentials();
    if (!c) throw new Error('Please sign in again to use CREST calls.');
    const body = Object.assign({ action, role: c.role, adminKey: c.adminKey || null, studentToken: c.studentToken || null, displayName: c.displayName, identity }, extra || {});
    const r = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Calling service could not verify your CREST session.');
    return data;
  }

  function metadataOf(participant) { try { return JSON.parse(participant.metadata || '{}'); } catch (_) { return {}; } }
  function updateOnlineCount() {
    onlineCount = lobby ? lobby.remoteParticipants.size : 0;
    const el = $('crestOnlineCount');
    if (el) el.textContent = isAdminPage() ? (onlineCount + ' student' + (onlineCount === 1 ? '' : 's') + ' online') : (onlineCount ? onlineCount + ' other CREST user' + (onlineCount === 1 ? '' : 's') + ' online' : 'You are connected to CREST calling');
  }

  async function connectLobby() {
    if (!LK) { setStatus('Calling library did not load. Refresh the page and try again.'); return; }
    const c = currentCredentials();
    if (!c) {
      if (lobby) { try { await lobby.disconnect(); } catch (_) {} lobby = null; }
      sessionSignature = '';
      updateOnlineCount();
      return;
    }

    // Do not tear down a room while its WebSocket handshake is still in progress.
    // The old 4-second health check could disconnect a slow connection and
    // produce LiveKit's "Client initiated disconnect" message.
    if (lobbyConnecting) return;
    if (lobby && sessionSignature === c.signature) {
      const state = lobby.state;
      if (
        state === LK.ConnectionState.Connected ||
        state === LK.ConnectionState.Connecting ||
        state === LK.ConnectionState.Reconnecting ||
        state === LK.ConnectionState.SignalReconnecting
      ) return;
    }

    lobbyConnecting = true;
    try {
      if (lobby) { try { await lobby.disconnect(); } catch (_) {} lobby = null; }
      sessionSignature = c.signature;
      role = c.role;
      displayName = c.displayName;
      identity = randomId();

      const grant = await requestToken('lobby', { room: LOBBY });
      const serverUrl = grant.serverUrl || LIVEKIT_URL;
      if (!grant.token) throw new Error('The calling service did not return a LiveKit access token.');
      if (!/^wss:\/\//i.test(serverUrl)) throw new Error('The LiveKit server address is invalid.');

      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      lobby = room;
      room.on(LK.RoomEvent.DataReceived, onLobbyData);
      room.on(LK.RoomEvent.ParticipantConnected, updateOnlineCount);
      room.on(LK.RoomEvent.ParticipantDisconnected, updateOnlineCount);
      room.on(LK.RoomEvent.Disconnected, (reason) => {
        updateOnlineCount();
        console.warn('CREST LiveKit lobby disconnected', reason || 'no reason supplied');
      });
      room.on(LK.RoomEvent.ConnectionStateChanged, (state) => {
        console.info('CREST LiveKit lobby state:', state);
      });

      await room.connect(serverUrl, grant.token);
      if (lobby !== room) {
        try { await room.disconnect(); } catch (_) {}
        return;
      }

      updateOnlineCount();
      if (isAdminPage()) setStatus('You are online. Start a call to invite everyone who is online.');
      else setStatus('You are online and can receive a teacher’s group call invitation.');
      if ($('crestStartVoice')) $('crestStartVoice').disabled = false;
      if ($('crestStartVideo')) $('crestStartVideo').disabled = false;
    } catch (e) {
      console.error('CREST lobby connection failed', e);
      setStatus('Calling is not ready: ' + (e?.message || String(e)));
      if ($('crestStartVoice')) $('crestStartVoice').disabled = true;
      if ($('crestStartVideo')) $('crestStartVideo').disabled = true;
    } finally {
      lobbyConnecting = false;
    }
  }

  async function sendLobby(data) {
    if (!lobby || lobby.state !== LK.ConnectionState.Connected) throw new Error('You are not connected to the CREST calling room.');
    await lobby.localParticipant.publishData(enc(data), { reliable: true });
  }

  async function startGroupCall(mode) {
    if (role !== 'admin' || !lobby) return;
    if (callJoined || activeTicket) { setStatus('A call is already active. End it before starting another.'); return; }
    try {
      setStatus('Preparing your ' + (mode === 'video' ? 'video' : 'voice') + ' invitation…');
      const invite = await requestToken('create', { mode });
      activeTicket = invite.ticket; activeCallId = invite.callId; activeMode = mode;
      await sendLobby({ type: 'call-invite', callId: invite.callId, ticket: invite.ticket, mode, caller: displayName, at: Date.now() });
      setStatus('Invitation sent to ' + onlineCount + ' online student(s). Waiting for someone to accept…');
      inviteTimer = setTimeout(() => {
        if (!callJoined && activeTicket) {
          sendLobby({ type: 'call-cancel', callId: activeCallId }).catch(() => {});
          activeTicket = null; activeCallId = null; setStatus('No one accepted. You can start another call.');
        }
      }, 60000);
    } catch (e) { setStatus('Could not start call: ' + e.message); }
  }

  function onLobbyData(payload, participant) {
    const msg = dec(payload); if (!msg || !participant) return;
    const sender = metadataOf(participant);
    if (msg.type === 'call-invite' && role === 'student' && sender.role === 'admin' && typeof msg.ticket === 'string') {
      incoming = msg;
      $('crestIncomingText').textContent = (msg.caller || 'Your teacher') + ' is inviting you to a ' + (msg.mode === 'video' ? 'video' : 'voice') + ' group call. You can choose whether to join.';
      $('crestIncomingCall').style.display = 'flex';
    }
    if (msg.type === 'call-accept' && role === 'admin' && sender.role === 'student' && msg.callId === activeCallId && !callJoined && !joiningCall) {
      if (inviteTimer) clearTimeout(inviteTimer);
      joinCall(activeTicket, activeCallId, activeMode, false).catch(e => setStatus('Could not join call: ' + e.message));
    }
    if (msg.type === 'call-cancel' && sender.role === 'admin' && incoming && msg.callId === incoming.callId) {
      incoming = null; $('crestIncomingCall').style.display = 'none';
    }
    if (msg.type === 'call-end' && sender.role === 'admin' && activeCallId && msg.callId === activeCallId) leaveCall(false);
  }

  async function acceptIncoming() {
    if (!incoming) return;
    const invite = incoming; incoming = null; $('crestIncomingCall').style.display = 'none';
    try {
      await sendLobby({ type: 'call-accept', callId: invite.callId });
      await joinCall(invite.ticket, invite.callId, invite.mode, true);
    } catch (e) { setStatus('Could not join the call: ' + e.message); }
  }
  async function declineIncoming() {
    if (incoming) sendLobby({ type: 'call-decline', callId: incoming.callId }).catch(() => {});
    incoming = null; $('crestIncomingCall').style.display = 'none';
    setStatus('You declined the invitation.');
  }

  async function joinCall(ticket, callId, mode, isStudentAccept) {
    if ((callRoom && callJoined) || joiningCall) return;
    joiningCall = true;
    try {
      const grant = await requestToken('join', { ticket });
      callRoom = new LK.Room({ adaptiveStream: true, dynacast: true });
      callRoom.on(LK.RoomEvent.TrackSubscribed, (track, publication, participant) => attachRemoteTrack(track, participant));
      callRoom.on(LK.RoomEvent.TrackUnsubscribed, (track) => detachTrack(track));
      callRoom.on(LK.RoomEvent.ParticipantDisconnected, updateCallStatus);
      callRoom.on(LK.RoomEvent.Disconnected, () => { if (callJoined) leaveCall(false); });
      await callRoom.connect(LIVEKIT_URL, grant.token);
      activeTicket = ticket; activeCallId = callId; activeMode = mode; callJoined = true;
      $('crestCallModal').style.display = 'flex';
      $('crestLeaveBtn').textContent = role === 'admin' ? 'End group call' : 'Leave call';
      $('crestCallModeLabel').textContent = mode === 'video' ? 'VIDEO CALL' : 'VOICE CALL';
      $('crestCameraBtn').style.display = mode === 'video' ? 'inline-block' : 'none';
      $('crestCallVideos').innerHTML = '';
      addLocalTile();
      localMic = true; localCamera = false;
      await callRoom.localParticipant.setMicrophoneEnabled(true);
      $('crestCameraBtn').textContent = 'Turn camera on';
      updateCallStatus();
    } catch (e) {
      if (callRoom) { try { await callRoom.disconnect(); } catch (_) {} callRoom = null; }
      throw e;
    } finally { joiningCall = false; }
  }

  function addLocalTile() {
    const tile = document.createElement('div'); tile.className = 'crest-call-tile'; tile.id = 'crestLocalTile';
    const label = document.createElement('span'); label.textContent = 'You'; tile.appendChild(label); $('crestCallVideos').appendChild(tile);
    const pub = callRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
    if (pub && pub.track) tile.insertBefore(pub.track.attach(), label);
  }
  function attachRemoteTrack(track, participant) {
    if (track.kind === LK.Track.Kind.Audio) {
      const el = track.attach(); el.autoplay = true; el.style.display = 'none'; $('crestCallVideos').appendChild(el); return;
    }
    let tile = $('crestTile_' + participant.sid);
    if (!tile) {
      tile = document.createElement('div'); tile.className = 'crest-call-tile'; tile.id = 'crestTile_' + participant.sid;
      const label = document.createElement('span'); label.textContent = participant.name || 'CREST participant'; tile.appendChild(label); $('crestCallVideos').appendChild(tile);
    }
    tile.insertBefore(track.attach(), tile.firstChild);
  }
  function detachTrack(track) { track.detach().forEach(el => el.remove()); }
  function updateCallStatus() {
    const count = callRoom ? callRoom.remoteParticipants.size + 1 : 0;
    const el = $('crestCallStatus'); if (el && callJoined) el.textContent = count + ' participant' + (count === 1 ? '' : 's') + ' in the call';
  }
  async function toggleMic() {
    if (!callRoom) return;
    localMic = !localMic; await callRoom.localParticipant.setMicrophoneEnabled(localMic);
    $('crestMicBtn').textContent = localMic ? 'Mute microphone' : 'Unmute microphone';
  }
  async function toggleCamera() {
    if (!callRoom || activeMode !== 'video') return;
    localCamera = !localCamera; await callRoom.localParticipant.setCameraEnabled(localCamera);
    const tile = $('crestLocalTile');
    if (localCamera) {
      const pub = callRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
      if (pub && pub.track && tile) { const label = tile.querySelector('span'); tile.insertBefore(pub.track.attach(), label || null); }
    } else if (tile) { tile.querySelectorAll('video').forEach(v => v.remove()); }
    $('crestCameraBtn').textContent = localCamera ? 'Turn camera off' : 'Turn camera on';
  }
  async function leaveCall(notify) {
    const oldId = activeCallId;
    callJoined = false; joiningCall = false;
    if (notify && role === 'admin' && oldId && lobby) sendLobby({ type: 'call-end', callId: oldId }).catch(() => {});
    if (inviteTimer) clearTimeout(inviteTimer); inviteTimer = null;
    if (callRoom) { try { await callRoom.localParticipant.setMicrophoneEnabled(false); } catch (_) {} try { await callRoom.localParticipant.setCameraEnabled(false); } catch (_) {} try { await callRoom.disconnect(); } catch (_) {} }
    callRoom = null; activeTicket = null; activeCallId = null; activeMode = null;
    if ($('crestCallModal')) $('crestCallModal').style.display = 'none';
    if ($('crestCallVideos')) $('crestCallVideos').innerHTML = '';
    if (role === 'admin') setStatus('Call ended. You can start another group call.');
    else setStatus('You left the call. You remain available for another teacher invitation.');
  }

  function boot() {
    addStyles(); addCallUI(); setupCallTools();
    connectLobby();
    connectTimer = setInterval(() => {
      const c = currentCredentials();
      if (!c && lobby) { lobby.disconnect().catch(() => {}); lobby = null; sessionSignature = ''; updateOnlineCount(); }
      else if (LK && c && (!lobby || sessionSignature !== c.signature || lobby.state !== LK.ConnectionState.Connected)) connectLobby();
    }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
