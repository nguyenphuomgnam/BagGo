import { useState } from 'react';
import { PlusCircle, Edit, Trash2, MapPin, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

export default function StationManager({
  token,
  stations,
  onRefresh,
  setMessage,
}) {
  const [loading, setLoading] = useState(false);
  const [editingStation, setEditingStation] = useState(null); // null means creating
  const [formData, setFormData] = useState({
    name: '',
    latitude: 10.7725,
    longitude: 106.6679,
    address: '',
  });

  function resetForm() {
    setEditingStation(null);
    setFormData({
      name: '',
      latitude: 10.7725,
      longitude: 106.6679,
      address: '',
    });
  }

  function handleEdit(station) {
    setEditingStation(station);
    setFormData({
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      address: station.address || '',
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tên trạm.' });
      return;
    }
    setLoading(true);
    try {
      if (editingStation) {
        await api.updateStation(token, editingStation.id, formData);
        setMessage({ type: 'success', text: `Cập nhật trạm "${formData.name}" thành công.` });
      } else {
        await api.createStation(token, formData);
        setMessage({ type: 'success', text: `Thêm trạm mới "${formData.name}" thành công.` });
      }
      resetForm();
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Lỗi thao tác trạm.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(station) {
    if (!confirm(`Bạn có chắc chắn muốn xóa trạm "${station.name}"? Tủ thuộc trạm này phải được giải phóng trước.`)) {
      return;
    }
    setLoading(true);
    try {
      await api.deleteStation(token, station.id);
      setMessage({ type: 'success', text: `Đã xóa trạm "${station.name}".` });
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xóa trạm.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Station CRUD Form */}
      <div className="baggo-surface rounded-lg border p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <PlusCircle className="h-5 w-5 text-brand-700" />
          <h2 className="text-lg font-extrabold text-slate-800">
            {editingStation ? `Cập nhật trạm: ${editingStation.name}` : 'Thêm trạm phục vụ mới'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Tên trạm</span>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ví dụ: Trạm Bago Quận 1"
              className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Vĩ độ (Latitude)</span>
              <input
                type="number"
                step="0.000001"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Kinh độ (Longitude)</span>
              <input
                type="number"
                step="0.000001"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Địa chỉ cụ thể</span>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Ví dụ: 12 Lê Lợi, Bến Nghé, Quận 1"
              className="mt-1.5 w-full rounded-lg border border-brand-100 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
            />
          </label>

          <div className="flex gap-2 mt-6">
            {editingStation && (
              <button
                type="button"
                onClick={resetForm}
                className="w-1/3 rounded-lg border border-brand-100 bg-white py-3 font-extrabold text-slate-700 hover:border-brand-300 transition"
              >
                Hủy sửa
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="baggo-primary flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-3 font-extrabold disabled:opacity-60 transition"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingStation ? 'Cập nhật' : 'Thêm trạm'}
            </button>
          </div>
        </form>
      </div>

      {/* Stations List */}
      <div className="baggo-surface rounded-lg border p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-extrabold text-slate-800">Danh sách trạm hiện có</h2>
            </div>
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Làm mới trạm"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {stations.map((station) => (
              <div key={station.id} className="rounded-lg border border-slate-100 bg-white p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="font-extrabold text-slate-800">{station.name}</div>
                  <div className="text-2xs font-semibold text-slate-400 mt-0.5">{station.address || 'Không rõ địa chỉ'}</div>
                  <div className="mt-2 text-2xs font-mono text-slate-500">
                    Tọa độ: {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-50 border border-brand-100 px-2 py-1 text-2xs font-extrabold text-brand-700">
                    {station.total_lockers || 0} tủ
                  </span>
                  <button
                    onClick={() => handleEdit(station)}
                    className="p-1.5 rounded-lg border border-slate-100 bg-white text-slate-500 hover:border-brand-200 hover:text-brand-700 transition"
                    title="Sửa trạm"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(station)}
                    className="p-1.5 rounded-lg border border-rose-100 bg-white text-rose-500 hover:border-rose-200 hover:text-rose-700 transition"
                    title="Xóa trạm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {stations.length === 0 && (
              <div className="rounded-lg border border-dashed border-brand-200 p-8 text-center text-sm font-semibold text-slate-400">
                Chưa có trạm nào được khai báo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
