document.getElementById('check-btn').addEventListener('click', () => {
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
      canvas.toBlob(async (blob) => {
        stream.getTracks().forEach(t => t.stop());
        modal.style.display = 'none';
        const formData = new FormData();
        formData.append('file', blob);
        const res = await fetch('/api/remote/identify', {method:'POST', body: formData});
        const data = await res.json();
        document.getElementById('result').innerHTML = `
          <p>Ngăn: ${data.locker_id}</p>
          <p>Còn lại: ${data.time_left}</p>
          <button onclick="blink(${data.locker_id})">💡 Nhấp nháy tìm tủ</button>
        `;
      }, 'image/jpeg');
    };
  });
});

async function blink(lockerId) {
  await fetch(`/api/remote/blink/${lockerId}`, {method:'POST'});
  alert('Tủ đang nhấp nháy 10 giây!');
}