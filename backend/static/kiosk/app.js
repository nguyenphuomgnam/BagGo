const API = window.location.origin;
let selectedLocker = null;
let currentRentalId = null;

const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws`);
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'locker_update' || data.type === 'locker_status') {
    loadLockers();
  }
};

async function loadLockers() {
  const res = await fetch(`${API}/api/lockers`);
  const lockers = await res.json();
  const grid = document.getElementById('locker-grid');
  grid.innerHTML = '';
  lockers.forEach(locker => {
    const div = document.createElement('div');
    div.className = `locker ${locker.status.toLowerCase()}`;
    div.textContent = locker.name;
    div.onclick = () => selectLocker(locker);
    grid.appendChild(div);
  });
}

function selectLocker(locker) {
  selectedLocker = locker.id;
  document.getElementById('btn-rent').style.display = locker.status === 'AVAILABLE' ? 'inline-block' : 'none';
  document.getElementById('btn-return').style.display = locker.status === 'OCCUPIED' ? 'inline-block' : 'none';
}

function openCamera(callback) {
  const modal = document.getElementById('camera-modal');
  modal.style.display = 'flex';
  const video = document.getElementById('video');
  navigator.mediaDevices.getUserMedia({video:true}).then(stream => {
    video.srcObject = stream;
    document.getElementById('capture-btn').onclick = () => {
      const canvas = document.getElementById('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        stream.getTracks().forEach(track => track.stop());
        modal.style.display = 'none';
        callback(blob);
      }, 'image/jpeg');
    };
  });
}

async function startRent() {
  const hours = prompt('Nhập số giờ thuê (1-5):', '2');
  if (!hours) return;
  const res = await fetch(`${API}/api/reserve?locker_id=${selectedLocker}&hours=${hours}`, {method:'POST'});
  const data = await res.json();
  currentRentalId = data.rental_id;
  openCamera(async (imageBlob) => {
    const formData = new FormData();
    formData.append('file', imageBlob);
    await fetch(`${API}/api/upload-face/${currentRentalId}`, {method:'POST', body: formData});
    // giả lập thanh toán
    await fetch(`${API}/api/payment/callback?rental_id=${currentRentalId}`, {method:'POST'});
    document.getElementById('status-message').innerText = 'Tủ đã mở, hãy cất đồ và đóng cửa.';
    loadLockers();
  });
}

async function startReturn() {
  openCamera(async (imageBlob) => {
    const formData = new FormData();
    formData.append('file', imageBlob);
    const identifyRes = await fetch(`${API}/api/identify`, {method:'POST', body: formData});
    if (identifyRes.status !== 200) {
      alert('Khuôn mặt không khớp!');
      return;
    }
    const identifyData = await identifyRes.json();
    if (confirm('Bạn muốn trả tủ và kết thúc thuê?')) {
      await fetch(`${API}/api/return?rental_id=${identifyData.rental_id}`, {method:'POST'});
      document.getElementById('status-message').innerText = 'Cảm ơn bạn đã sử dụng dịch vụ.';
    } else {
      await fetch(`${API}/api/temp-open?rental_id=${identifyData.rental_id}`, {method:'POST'});
      document.getElementById('status-message').innerText = 'Tủ đã mở tạm thời.';
    }
    loadLockers();
  });
}

loadLockers();
setInterval(loadLockers, 10000);