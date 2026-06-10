const API = window.location.origin;
let selectedLocker = null;
const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws`);
ws.onmessage = () => loadLockers();

async function loadLockers() {
  const res = await fetch(`${API}/api/lockers`);
  const lockers = await res.json();
  const grid = document.getElementById('locker-grid');
  grid.innerHTML = '';
  lockers.forEach(locker => {
    const div = document.createElement('div');
    div.className = `locker ${locker.status.toLowerCase()}`;
    div.textContent = locker.name;
    div.onclick = () => { selectedLocker = locker.id; };
    grid.appendChild(div);
  });
}

async function adminOpen() {
  if (!selectedLocker) return alert('Chọn ngăn trước');
  await fetch(`${API}/api/admin/open?locker_id=${selectedLocker}`, {method:'POST'});
  loadLockers();
}
async function adminClose() {
  if (!selectedLocker) return alert('Chọn ngăn trước');
  await fetch(`${API}/api/admin/close?locker_id=${selectedLocker}`, {method:'POST'});
  loadLockers();
}
async function forceReturn() {
  if (!selectedLocker) return alert('Chọn ngăn trước');
  if (!confirm('Xác nhận kết thúc cưỡng chế?')) return;
  await fetch(`${API}/api/admin/force-return?locker_id=${selectedLocker}`, {method:'POST'});
  loadLockers();
}
loadLockers();
setInterval(loadLockers, 5000);