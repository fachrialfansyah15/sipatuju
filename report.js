// Gunakan singleton Supabase client agar tidak membuat banyak instance
const supabase = window.__supabaseClient || (window.__supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY));
// Try multiple bucket ids to be resilient to dash/underscore differences
const BUCKET_CANDIDATES = Array.isArray(window.SUPABASE_BUCKETS) && window.SUPABASE_BUCKETS.length
  ? window.SUPABASE_BUCKETS
  : ["foto_jalan", "foto-jalan"]; // defaults

console.log("[report.js] Supabase client initialized from window config"); 

// Inisialisasi peta Leaflet - Fokus ke Kota Palu
const map = L.map("mapPreview", {
  zoomControl: false // Disable default zoom control
}).setView([-0.898, 119.870], 13); 

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

// Marker untuk menandai lokasi yang dipilih
let marker = null;

// Bounds Kota Palu (untuk validasi) - diperluas agar mencakup Tawaeli (utara)
const boundsPalu = L.latLngBounds(
  [-1.02, 119.72],  // Southwest (lebih lebar)
  [-0.70, 120.02]   // Northeast (menjangkau Tawaeli + buffer)
);

// --- Lightweight toast helper (konsisten antar halaman) ---
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toastReport');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toastReport';
  const bg = type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#667eea';
  toast.style.cssText = `position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: ${bg}; color: #fff; padding: 12px 18px; border-radius: 10px; z-index: 10000; box-shadow: 0 6px 18px rgba(0,0,0,.2); font-weight: 600;`;
  toast.innerHTML = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// Icon marker lokasi pengguna/terpilih: pin biru (selaras dengan map.html)
function getUserLocationIcon() {
  return L.icon({
    iconUrl:
      'data:image/svg+xml;utf8,\
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="42" viewBox="0 0 28 42">\
  <path d="M14 0C6.82 0 1 5.82 1 13c0 8.35 10.2 19.33 12.4 21.73.56.6 1.64.6 2.2 0C18.8 32.33 29 21.35 29 13 29 5.82 23.18 0 16 0z" fill="%23586EEA" transform="translate(-1)"/>\
  <circle cx="14" cy="14" r="5" fill="%23ffffff"/>\
  <circle cx="14" cy="14" r="2.5" fill="%23586EEA"/>\
</svg>',
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -36]
  });
}

// ========== Reverse Geocoding Function ==========
async function reverseGeocode(lat, lng) {
  try {
    console.log(`[Reverse Geocoding] Fetching address for: ${lat}, ${lng}`);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SIPATUJU Road Monitor App'
        }
      }
    );
    
    const data = await response.json();
    
    if (data && data.address) {
      // Prioritas: road > suburb > city_district > neighbourhood
      const roadName = data.address.road || 
                      data.address.suburb || 
                      data.address.city_district || 
                      data.address.neighbourhood ||
                      'Jalan tidak diketahui';
      
      console.log(`[Reverse Geocoding] Road name found: ${roadName}`);
      
      // Auto-fill field nama jalan
      const streetNameInput = document.getElementById('streetName');
      if (streetNameInput) {
        streetNameInput.value = roadName;
        console.log(`[Reverse Geocoding] Street name filled: ${roadName}`);
      }
      
      return roadName;
    } else {
      console.warn('[Reverse Geocoding] No address found');
      return 'Jalan tidak diketahui';
    }
  } catch (error) {
    console.error('[Reverse Geocoding] Error:', error);
    return 'Jalan tidak diketahui';
  }
}

// Event handler untuk klik pada peta (onMapClick)
map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  
  // Validasi lokasi harus di dalam bounds Palu
  if (!boundsPalu.contains([lat, lng])) {
    alert("⚠️ Lokasi yang dipilih harus di dalam wilayah Kota Palu!");
    return;
  }
  
  // Hapus marker lama jika ada
  if (marker) marker.remove();
  
  // Tambahkan marker baru di lokasi yang diklik
  marker = L.marker([lat, lng], { icon: getUserLocationIcon() }).addTo(map);
  
  // Auto-fill form fields dengan koordinat
  document.getElementById("coordinates").value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  document.getElementById("latitude").value = lat.toFixed(6);
  document.getElementById("longitude").value = lng.toFixed(6);
  
  console.log(`Lokasi dipilih: Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
  
  // Auto-fill nama jalan dengan reverse geocoding
  await reverseGeocode(lat, lng);
});

// ========== Load koordinat dari URL params atau localStorage ==========
async function loadSelectedLocation() {
  // Cek URL params terlebih dahulu (dari redirect map.html)
  const urlParams = new URLSearchParams(window.location.search);
  let selectedLat = urlParams.get("lat");
  let selectedLng = urlParams.get("lng");
  
  // Jika tidak ada di URL, cek localStorage
  if (!selectedLat || !selectedLng) {
    selectedLat = localStorage.getItem("selectedLat");
    selectedLng = localStorage.getItem("selectedLng");
  }
  
  if (selectedLat && selectedLng) {
    // Isi form dengan koordinat yang dipilih
    document.getElementById("coordinates").value = `${selectedLat}, ${selectedLng}`;
    document.getElementById("latitude").value = selectedLat;
    document.getElementById("longitude").value = selectedLng;
    
    // Update marker di peta
    const lat = parseFloat(selectedLat);
    const lng = parseFloat(selectedLng);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      if (marker) marker.remove();
      marker = L.marker([lat, lng], { icon: getUserLocationIcon() }).addTo(map);
      map.setView([lat, lng], 15);
      
      // Auto-fill nama jalan dengan reverse geocoding
      await reverseGeocode(lat, lng);
    }
    
    // Hapus dari localStorage dan clean URL
    localStorage.removeItem("selectedLat");
    localStorage.removeItem("selectedLng");
    if (urlParams.has("lat")) {
      window.history.replaceState({}, document.title, "report.html");
    }
    
    // Tampilkan notifikasi sukses
    const notification = document.createElement("div");
    notification.style.cssText = "position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: #28a745; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.2);";
    notification.innerHTML = '<i class="fas fa-check-circle"></i> Lokasi berhasil dipilih dari peta!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// ========== Auto Geolocate ==========
function handleGeolocate() {
  const btn = document.getElementById('geolocateBtn');
  const icon = btn?.querySelector('i');
  if (!navigator.geolocation) {
    showToast('Browser Anda tidak mendukung geolocation', 'error');
    return;
  }

  if (icon) { icon.className = 'fas fa-spinner fa-spin'; btn.disabled = true; }
  console.log('[report.js] Attempting to get user location...');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy || 0;
      console.log(`[report.js] User location: ${lat}, ${lng} (±${accuracy}m)`);

      if (accuracy > 150) {
        showToast('Akurasi lokasi rendah. Mendekat ke estimasi posisi Anda.', 'info');
      }

      const userLatLng = L.latLng(lat, lng);
      const inside = boundsPalu.contains(userLatLng);

      // Set marker di lokasi user
      if (marker) marker.remove();
      marker = L.marker([lat, lng], { icon: getUserLocationIcon() }).addTo(map);
      map.setView([lat, lng], inside ? 16 : 13);
      if (!inside) {
        showToast('Lokasi Anda berada di luar area Palu – peta tetap dipusatkan ke posisi Anda.', 'info');
      }

      // Update form
      document.getElementById('coordinates').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      document.getElementById('latitude').value = lat.toFixed(6);
      document.getElementById('longitude').value = lng.toFixed(6);

      // Auto-fill nama jalan dengan reverse geocoding
      await reverseGeocode(lat, lng);
    },
    (error) => {
      console.error('[report.js] Geolocation error:', error);
      showToast('Tidak dapat mengakses lokasi. Pastikan izin lokasi diaktifkan.', 'error');
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );

  // Pulihkan ikon tombol setelah 2 detik
  setTimeout(() => {
    if (icon) { icon.className = 'fas fa-crosshairs'; btn.disabled = false; }
  }, 2000);
}

// ========== Inisialisasi saat DOM ready ==========
document.addEventListener("DOMContentLoaded", () => {
  console.log("[report.js] DOM loaded, initializing...");
  
  // Sync header username for this page (other pages do it in their own JS)
  try {
    const el = document.getElementById('userName');
    const name = window.auth && typeof window.auth.getCurrentUser === 'function' ? window.auth.getCurrentUser() : null;
    if (el && name) el.textContent = name;
  } catch (_) {}

  // Load koordinat dari URL/localStorage jika ada
  loadSelectedLocation();
  
  // Setup tombol geolocate
  const geolocateBtn = document.getElementById("geolocateBtn");
  if (geolocateBtn) {
    geolocateBtn.addEventListener("click", handleGeolocate);
    console.log("[report.js] Geolocate button initialized");
  }
  
  // Setup tombol full map
  const fullMapBtn = document.getElementById("fullMapBtn");
  if (fullMapBtn) {
    fullMapBtn.addEventListener("click", () => {
      console.log("[report.js] Redirecting to full map for location selection");
      window.location.href = "map.html?selectLocation=true";
    });
    console.log("[report.js] Full map button initialized");
  }
});

// ========== Preview Foto ==========
const roadPhotoInput = document.getElementById("roadPhoto");
const filePreview = document.getElementById("filePreview");

roadPhotoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      filePreview.innerHTML = `<img src="${reader.result}" alt="Preview" style="max-width:100%;border-radius:8px;margin-top:8px;">`;
    };
    reader.readAsDataURL(file);
  }
});

// ========== Submit Form ==========
const form = document.getElementById("damageReportForm");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const nama_jalan = formData.get("streetName");
  const jenis_kerusakan = formData.get("damageSeverity");
  const koordinat = formData.get("coordinates");
  const reporter = formData.get("reporterName");
  const tanggal_survey = new Date().toLocaleDateString("id-ID");

  // Ambil koordinat dari field terpisah (lebih reliable)
  const latitudeInput = formData.get("latitude");
  const longitudeInput = formData.get("longitude");
  
  // Pastikan koordinat valid
  if (!latitudeInput || !longitudeInput) {
    alert("Pilih lokasi pada peta terlebih dahulu.");
    return;
  }
  
  const Latitude = parseFloat(latitudeInput);
  const Longitude = parseFloat(longitudeInput);
  
  if (isNaN(Latitude) || isNaN(Longitude)) {
    alert("Koordinat tidak valid. Silakan pilih lokasi di peta.");
    return;
  }

  // Upload foto ke Supabase Storage (coba beberapa bucket candidates)
  let foto_jalan_url = null;
  const file = formData.get("roadPhoto");
  if (file && file.name) {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    let lastErr = null;
    let lastBucket = null;
    for (const bucketId of BUCKET_CANDIDATES) {
      console.log(`[report.js] Attempting upload to bucket: ${bucketId}`);
      const { data: uploadData, error: upErr } = await supabase.storage
        .from(bucketId)
        .upload(fileName, file, { 
          contentType: file.type || 'image/jpeg',
          upsert: false 
        });
      
      if (!upErr && uploadData) {
        console.log(`[report.js] Upload successful to bucket: ${bucketId}`);
        const { data: urlData } = supabase.storage.from(bucketId).getPublicUrl(fileName);
        foto_jalan_url = urlData?.publicUrl || null;
        if (foto_jalan_url) {
          console.log(`[report.js] Public URL generated: ${foto_jalan_url}`);
          break;
        }
      } else {
        console.error(`[report.js] Upload failed to bucket ${bucketId}:`, upErr);
        lastErr = upErr;
        lastBucket = bucketId;
      }
    }

    if (!foto_jalan_url) {
      console.error("[report.js] All upload attempts failed. Last error:", lastErr);
      console.error("[report.js] Last attempted bucket:", lastBucket);
      alert(`Gagal mengunggah foto jalan. Error: ${lastErr?.message || 'Unknown error'}\n\nPastikan:\n1. Bucket 'foto_jalan' atau 'foto-jalan' ada di Supabase Storage\n2. RLS policy mengizinkan upload untuk role 'anon' atau 'authenticated'`);
      return;
    }
  }

  // Ambil user_id dari sesi auth
  // Note: user_id harus UUID (string), bukan integer
  let user_id = null;
  try { 
    user_id = window.auth?.getUserId ? window.auth.getUserId() : null;
    // Keep as string (UUID format) - do NOT convert to integer
    // If it's a number, it means the Edge Function returned integer ID instead of UUID
    // In that case, we need to fetch the actual UUID from users table
    if (user_id && typeof user_id === 'number') {
      console.warn("[report.js] user_id is a number, but database expects UUID. Fetching UUID from users table...");
      // Get current username to find the user
      const currentUser = window.auth?.currentUser || null;
      if (currentUser) {
        // Try to get UUID from users table using username
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('id')
          .eq('username', currentUser)
          .maybeSingle();
        
        if (!userErr && userData && userData.id) {
          user_id = userData.id; // Use the UUID from database
          console.log("[report.js] Found UUID from users table by username:", user_id);
        } else {
          // Fallback: try with integer ID (in case users.id is also integer)
          const { data: userData2, error: userErr2 } = await supabase
            .from('users')
            .select('id')
            .eq('id', user_id.toString())
            .maybeSingle();
          
          if (!userErr2 && userData2 && userData2.id) {
            user_id = userData2.id;
            console.log("[report.js] Found UUID from users table by ID:", user_id);
          } else {
            console.error("[report.js] Could not find user with ID:", user_id, "or username:", currentUser);
            user_id = null;
          }
        }
      } else {
        console.error("[report.js] No currentUser available to fetch UUID");
        user_id = null;
      }
    } else if (user_id && typeof user_id === 'string') {
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user_id)) {
        console.warn("[report.js] user_id is not a valid UUID format:", user_id);
        // Try to fetch UUID from users table using username or other identifier
        const currentUser = window.auth?.currentUser || null;
        if (currentUser) {
          const { data: userData, error: userErr } = await supabase
            .from('users')
            .select('id')
            .eq('username', currentUser)
            .maybeSingle();
          
          if (!userErr && userData && userData.id) {
            user_id = userData.id;
            console.log("[report.js] Found UUID from users table by username:", user_id);
          }
        }
      }
    }
  } catch (err) {
    console.error("[report.js] Error getting user_id:", err);
    user_id = null;
  }
  
  if (!user_id) {
    console.error("[report.js] No valid user_id found. User must be logged in.");
    alert("Anda harus login untuk mengirim laporan. Silakan logout dan login kembali.");
    return;
  }
  
  console.log("[report.js] Using user_id:", user_id, "Type:", typeof user_id);

  // Insert ke tabel laporan_masuk dengan user_id dan status awal
  const insertData = {
    tanggal_survey,
    nama_jalan,
    jenis_kerusakan,
    foto_jalan: foto_jalan_url,
    Latitude,
    Longitude,
    user_id,
    status: 'reported'
  };
  
  console.log("[report.js] Inserting data:", insertData);
  
  const { data: insertResult, error: insertError } = await supabase
    .from("laporan_masuk")
    .insert([insertData])
    .select();

  if (insertError) {
    console.error("[report.js] Insert error:", insertError);
    console.error("[report.js] Error details:", {
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
      code: insertError.code
    });
    
    let errorMsg = "Gagal mengirim laporan!";
    if (insertError.code === '23505') {
      errorMsg = "Laporan dengan data yang sama sudah ada. Silakan coba lagi dengan lokasi yang berbeda.";
    } else if (insertError.code === '42501') {
      errorMsg = "Anda tidak memiliki izin untuk mengirim laporan. Pastikan Anda sudah login.";
    } else if (insertError.code === '23503') {
      // Foreign key constraint violation
      errorMsg = `User ID tidak valid. Silakan logout dan login kembali.\n\nDetail: ${insertError.message || 'Foreign key constraint violation'}`;
      console.error("[report.js] Foreign key violation - user_id mungkin tidak ada di tabel users:", user_id);
    } else if (insertError.message) {
      errorMsg = `Gagal mengirim laporan: ${insertError.message}`;
    }
    
    alert(errorMsg);
  } else {
    console.log("[report.js] Insert successful:", insertResult);
    alert("✅ Laporan berhasil dikirim!");
    form.reset();
    filePreview.innerHTML = "";
    if (marker) marker.remove();
    // Reset koordinat fields
    document.getElementById("coordinates").value = "";
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";
  }
});
