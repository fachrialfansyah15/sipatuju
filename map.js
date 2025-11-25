// Supabase Configuration
window.SUPABASE_URL = 'https://cxcxatowzymfpasesrvp.supabase.co';
window.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Y3hhdG93enltZnBhc2VzcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTY0MDIsImV4cCI6MjA3NTU5MjQwMn0.klPbBM_u-UvlG5DTMmZxRIXuczpqqLfupJUZW0gMRa0';

(function () {
  // Initialize Supabase client
  const supabase = window.__supabaseClient || (window.__supabaseClient = window.supabase?.createClient(window.SUPABASE_URL, window.SUPABASE_KEY));
  
  if (!supabase) {
    console.error("[map.js] Supabase client not initialized. Check if Supabase CDN is loaded.");
  }

  // Helper: selesai icon (green) replacing base when finished
  function getMarkerIconSelesai() {
    const isMobile = window.innerWidth <= 600;
    const size = isMobile ? [32, 32] : [40, 40];
    return L.icon({
      iconUrl: 'public/icons/marker-selesai.svg',
      iconSize: size,
      iconAnchor: [Math.round(size[0] / 2), size[1]],
      popupAnchor: [0, -Math.round(size[1] * 0.85)]
    });
  }

  // Mobile hamburger -> quick actions overlay
  function setupHamburgerMenu() {
    const toggle = document.getElementById('quickActionsToggle');
    const menu = document.getElementById('quickActionsMenu');
    const backdrop = document.getElementById('quickActionsBackdrop');

    if (!toggle || !menu || !backdrop) return;

    const closeMenu = () => {
      menu.classList.remove('open');
      backdrop.classList.remove('show');
      // Recalculate map size after layout changes
      if (window._map) setTimeout(() => window._map.invalidateSize(), 150);
    };

    const openMenu = () => {
      menu.classList.add('open');
      backdrop.classList.add('show');
      if (window._map) setTimeout(() => window._map.invalidateSize(), 150);
    };

    const handleToggle = (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      if (menu.classList.contains('open')) closeMenu();
      else openMenu();
    };

    // Open instantly on touch devices
    toggle.addEventListener('touchstart', handleToggle, { passive: false });
    // Fallback for click (desktop and some mobiles)
    toggle.addEventListener('click', handleToggle);

    backdrop.addEventListener('click', closeMenu);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // Ensure map resizes correctly on viewport changes (mobile orientation, etc.)
  function setupResizeInvalidate() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window._map) window._map.invalidateSize();
      }, 150);
    });
  }

  // Simple toast banner (non-blocking) for errors/info
  function showToast(message, type = 'error') {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.style.cssText = 'position:fixed; top:70px; left:50%; transform:translateX(-50%); z-index:9999; background:#fff; color:#333; border:1px solid #e5e7eb; box-shadow:0 6px 18px rgba(0,0,0,0.15); border-radius:10px; padding:10px 14px; font-size:14px;';
      document.body.appendChild(el);
    }
    el.style.background = type === 'error' ? '#fff' : '#ecfdf5';
    el.style.borderColor = type === 'error' ? '#e5e7eb' : '#10b981';
    el.style.color = '#333';
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // Guard for Supabase credentials
  if (!window.SUPABASE_URL || !window.SUPABASE_KEY) {
    console.warn('[map.js] Missing SUPABASE_URL or SUPABASE_KEY');
    showToast('Konfigurasi Supabase tidak ditemukan. Cek pengaturan.', 'error');
  }
  
  // Bucket name untuk foto
  const BUCKET_FOTO_JALAN = "foto_jalan";

  // Inject tooltip CSS once for better border/size fit
  function ensureTooltipStyles() {
    if (document.getElementById('leaflet-tooltip-own-style')) return;
    const style = document.createElement('style');
    style.id = 'leaflet-tooltip-own-style';
    style.textContent = `
      .leaflet-tooltip-own {
        padding: 8px 10px;
        border-radius: 8px;
        line-height: 1.35;
        white-space: normal;
        max-width: 260px;
      }
      .leaflet-tooltip-own b { font-weight: 700; }
      .leaflet-tooltip-own img { display:block; }
      .leaflet-popup-content img.popup-photo { width: 100%; height: 180px; object-fit: cover; border-radius: 10px; display: block; margin-top: 8px; }
      @media (max-width: 600px) { .leaflet-popup-content img.popup-photo { height: 160px; } }
    `;
    document.head.appendChild(style);
  }

  // Map bounds - Kota Palu dengan 8 Kecamatan (diperlebar untuk panning)
  // Kecamatan: Palu Barat, Palu Selatan, Palu Timur, Palu Utara, Tatanga, Ulujadi, Mantikulore, Tawaeli
  // Koordinat mencakup seluruh wilayah administratif Kota Palu + buffer untuk panning
  const boundsPalu = L.latLngBounds(
    [-1.02, 119.72], // Southwest corner (lebih lebar)
    [-0.70, 120.02]  // Northeast corner (menjangkau Tawaeli di utara + buffer)
  );

  // Legend filter for severity (clickable)
  let activeLegendFilter = 'all'; // 'all', 'Rusak Berat', 'Rusak Sedang', 'Rusak Ringan'

  function normalizeSeverity(val) {
    if (!val) return '';
    const s = String(val).toLowerCase();
    if (s.includes('berat')) return 'Rusak Berat';
    if (s.includes('sedang')) return 'Rusak Sedang';
    if (s.includes('ringan')) return 'Rusak Ringan';
    return val;
  }

  // Normalize status_pengerjaan to canonical values: 'proses' | 'selesai' | ''
  function normalizePengerjaan(val) {
    if (!val || val === '') return '';
    const s = String(val).toLowerCase().trim();
    // Treat various synonyms as 'proses'
    if (['proses','in_progress','processing','process','ongoing','dalam proses'].includes(s)) return 'proses';
    // Treat various synonyms as 'selesai'
    if (['selesai','completed','done','closed'].includes(s)) return 'selesai';
    // Ignore other values (like 'valid' or empty string)
    return '';
  }

  function severityColor(sev) {
    const n = normalizeSeverity(sev);
    if (n === 'Rusak Berat') return '#dc3545'; // red
    if (n === 'Rusak Sedang') return '#ff8c00'; // orange
    if (n === 'Rusak Ringan') return '#ffd31a'; // yellow
    return '#3b82f6'; // fallback blue
  }

  function createSeverityIcon(sev) {
    const color = severityColor(sev);
    const html = `
      <div style="width:26px;height:38px;">
        <svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 0C5.82 0 0 5.82 0 13c0 8.35 9.74 19.33 11.95 21.73.56.6 1.54.6 2.1 0C16.26 32.33 26 21.35 26 13 26 5.82 20.18 0 13 0z" fill="${color}" />
          <circle cx="13" cy="13" r="5.5" fill="#ffffff"/>
        </svg>
      </div>`;
    return L.divIcon({ className: 'severity-marker', html, iconSize: [26, 38], iconAnchor: [13, 38], popupAnchor: [0, -30], tooltipAnchor: [0, -32] });
  }

  // Marker icons untuk status pengerjaan
  const markerIconProses = L.icon({
    iconUrl: 'public/icons/Marker-Proses.svg',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -35]
  });

  const markerIconSelesai = L.icon({
    iconUrl: 'public/icons/marker-selesai.svg',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -35]
  });

  // Helper: responsive proses icon (32px on mobile, 40px otherwise)
  function getMarkerIconProses() {
    const isMobile = window.innerWidth <= 600;
    const size = isMobile ? [32, 32] : [40, 40];
    return L.icon({
      iconUrl: 'public/icons/Marker-Proses.svg',
      iconSize: size,
      iconAnchor: [Math.round(size[0] / 2), size[1]],
      popupAnchor: [0, -Math.round(size[1] * 0.85)]
    });
  }

  // Helper: smaller overlay icon for status 'proses' shown on top of base marker
  function getMarkerIconProsesSmall() {
    const isMobile = window.innerWidth <= 600;
    // Even smaller overlay icon
    const size = isMobile ? [14, 14] : [18, 18];
    // Push anchor further so the overlay sits higher above the base marker
    const anchorY = size[1] + (isMobile ? 26 : 30);
    return L.icon({
      iconUrl: 'public/icons/Marker-Proses.svg',
      iconSize: size,
      iconAnchor: [Math.round(size[0] / 2), anchorY],
      popupAnchor: [0, -Math.round(size[1] * 0.6)]
    });
  }

  // Initialize map function
  function initializeMap() {
    if (window._roadMonitorMapInitialized) return;
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('[map.js] Map element #map not found!');
      return;
    }
    
    console.log('[map.js] Map element found:', mapElement);
    console.log('[map.js] Map element dimensions:', mapElement.offsetWidth, 'x', mapElement.offsetHeight);
    
    window._map = L.map('map', {
      center: [-0.900, 119.870], // Kota Palu center
      zoom: 12,
      minZoom: 11,
      maxZoom: 18,
      zoomControl: false, // We'll add it to bottomright
      preferCanvas: false
    });

    console.log('[map.js] Leaflet map object created:', window._map);

    // Add tile layer
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(window._map);
    
    tileLayer.on('loading', () => console.log('[map.js] Tiles loading...'));
    tileLayer.on('load', () => console.log('[map.js] Tiles loaded!'));
    tileLayer.on('tileerror', (e) => console.error('[map.js] Tile error:', e));

    // Note: All controls (zoom, locate) moved to custom HTML buttons
    // No Leaflet controls added to map - using HTML buttons in map-controls div instead

    // Note: Legend moved to sidebar - no floating legend on map

    // Free panning enabled (no max bounds)
    
    // Layer groups
    window._damageLayer = L.layerGroup().addTo(window._map);
    window._maintenanceLayer = L.layerGroup(); // add as needed
    
    // Tambahkan marker default di pusat Kota Palu
    const paluCenterMarker = L.marker([-0.898, 119.870], {
      icon: L.divIcon({
        className: 'palu-center-marker',
        html: '<i class="fas fa-map-marker-alt" style="color: #667eea; font-size: 32px;"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }).addTo(window._map);
    paluCenterMarker.bindPopup('<strong>Kota Palu</strong><br/>Pusat Kota');
    
    window._roadMonitorMapInitialized = true;
    
    // Force map to recalculate size after initialization (multiple attempts)
    setTimeout(() => {
      if (window._map) {
        window._map.invalidateSize();
        console.log('[map.js] Map size invalidated and refreshed (100ms)');
      }
    }, 100);
    
    setTimeout(() => {
      if (window._map) {
        window._map.invalidateSize();
        console.log('[map.js] Map size invalidated and refreshed (500ms)');
      }
    }, 500);
    
    // Auto-locate user position (dengan pengecekan bounds)
    autoLocateUserWithBounds(window._map, boundsPalu);
  } // End of initializeMap function

  function getMapAndLayers() {
    return {
      map: window._map,
      damageLayer: window._damageLayer
    };
  }

  // Helpers: read different cases of column names (safe)
  function getVal(row, ...keys) {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== null && row[k] !== undefined) return row[k];
    }
    return null;
  }

  // Helper: Get photo URL from Supabase storage
  function getPhotoUrl(fotoJalanUrl) {
    if (!fotoJalanUrl) {
      console.log('[map.js] No foto_jalan URL provided');
      return null;
    }
    // Normalisasi dan trim
    let url = String(fotoJalanUrl).trim();
    
    // Kolom foto_jalan sudah berisi URL lengkap dari Supabase Storage
    // Format: https://cxcxatowzymfpasesrvp.supabase.co/storage/v1/object/public/foto_jalan/JR-PU-001.jpg
    if (url.startsWith('http')) {
      console.log('[map.js] Using full URL from database:', url);
      return url;
    }
    
    // Fallback: jika hanya nama file, generate URL
    try {
      const { data: publicURL } = supabase.storage
        .from('foto_jalan')
        .getPublicUrl(url);
      
      const imageURL = publicURL?.publicUrl || null;
      console.log('[map.js] Generated public URL:', imageURL);
      return imageURL;
    } catch (error) {
      console.error('[map.js] Error generating photo URL:', error);
      return null;
    }
  }

  // Render popup content sesuai format yang diminta
  function renderPopupContent(row) {
    // Ambil data dari kolom yang sesuai dengan struktur tabel
    const namaJalan = row.nama_jalan || 'Jalan Tidak Diketahui';
    const jenisKerusakan = row.jenis_kerusakan || 'Tidak dispesifikasi';
    const fotoPath = row.foto_jalan;
    
    console.log(`[map.js] Creating popup for: ${namaJalan}, foto_jalan: ${fotoPath}`);
    
    // Get photo URL dari storage
    const imageURL = getPhotoUrl(fotoPath);
    
    // Build foto HTML sesuai format yang diminta
    let fotoHtml = '';
    if (imageURL) {
      fotoHtml = `<img src="${imageURL}" class="popup-photo" onerror="this.style.display='none';">`;
    }

    // Format popup sesuai permintaan
    return `
      <div style="font-family:Arial,sans-serif; min-width:240px;">
        <b>Nama Jalan:</b> ${namaJalan}<br>
        <b>Jenis Kerusakan:</b> ${jenisKerusakan}<br>
        ${fotoHtml}
      </div>
    `;
  }

  // Clear markers
  function clearLayers() {
    if (window._damageLayer) window._damageLayer.clearLayers();
  }

  // Apply filters from UI
  function getActiveFilters() {
    const tipe = (document.getElementById('damageType')?.value || 'all');
    const status = (document.getElementById('statusFilter')?.value || 'all');
    const statusPengerjaan = (document.getElementById('statusPengerjaanFilter')?.value || 'all');
    return { tipe, status, statusPengerjaan, legendFilter: activeLegendFilter };
  }

  // Load markers from Supabase table "jalan_rusak"
  async function loadMarkersFromSupabase() {
    if (!supabase) {
      console.error('[map.js] supabase not initialized');
      return;
    }

    console.log('[map.js] Loading markers from jalan_rusak table...');
    
    try {
      // Ambil semua data dari tabel jalan_rusak (status banyak yang NULL)
      const { data, error } = await supabase
        .from('jalan_rusak')
        .select('*');

      if (error) {
        console.error('[map.js] Supabase select error:', error);
        showToast('Gagal memuat data dari Supabase: ' + error.message, 'error');
        return;
      }
      
      if (!Array.isArray(data)) {
        console.warn('[map.js] Data is not an array');
        return;
      }

      console.log(`[map.js] Fetched ${data.length} records from jalan_rusak`);

      clearLayers();

      const { tipe, status, statusPengerjaan: statusPengerjaanFilter, legendFilter } = getActiveFilters();
      console.log('[map.js] Active filters:', { tipe, status, statusPengerjaanFilter, legendFilter });

      let countActive = 0, countProcessing = 0, countCompleted = 0;
      let validMarkers = 0;
      let renderedMarkers = 0;

      data.forEach((row, index) => {
        // Ambil koordinat dari kolom Latitude dan Longitude (HURUF BESAR DI AWAL!)
        const lat = parseFloat(row.Latitude);
        const lng = parseFloat(row.Longitude);

        // Validasi koordinat
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`[map.js] Invalid coordinates for ${row.nama_jalan}: lat=${lat}, lng=${lng}`);
          return;
        }
        
        validMarkers++;

        const jenis = getVal(row, 'jenis_kerusakan', 'Jenis Kerusakan') || '';
        const stat = String(getVal(row, 'status') || '').toLowerCase();
        const statPengerjaan = normalizePengerjaan(getVal(row, 'status_pengerjaan', 'statusPengerjaan', 'Status Pengerjaan', 'status pengerjaan')) || '';

        // Map status from table jalan_rusak to UI buckets
        // aktif -> Active; pending/in_progress/disetujui -> Processing; selesai/completed/ditolak -> Completed
        // Hitung berdasarkan status_pengerjaan terlebih dahulu (lebih relevan untuk UI ini)
        if (statPengerjaan === 'proses') countProcessing++;
        else if (statPengerjaan === 'selesai') countCompleted++;
        else {
          // fallback ke kolom status lama jika status_pengerjaan kosong
          if (!stat || stat === 'aktif') countActive++;
          else if (['pending','in_progress','disetujui'].includes(stat)) countProcessing++;
          else if (['selesai','completed','ditolak'].includes(stat)) countCompleted++;
          else countActive++;
        }

        // apply filters
        if (tipe !== 'all' && jenis !== tipe) {
          console.log(`[map.js] Skipping ${row.nama_jalan}: jenis mismatch (${jenis} !== ${tipe})`);
          return;
        }
        if (status !== 'all' && stat !== status) {
          console.log(`[map.js] Skipping ${row.nama_jalan}: status mismatch (${stat} !== ${status})`);
          return;
        }
        // apply status pengerjaan filter
        if (statusPengerjaanFilter !== 'all') {
          if (statusPengerjaanFilter === 'proses' && statPengerjaan !== 'proses') {
            console.log(`[map.js] Skipping ${row.nama_jalan}: statusPengerjaan mismatch (${statPengerjaan} !== proses)`);
            return;
          }
          if (statusPengerjaanFilter === 'selesai' && statPengerjaan !== 'selesai') {
            console.log(`[map.js] Skipping ${row.nama_jalan}: statusPengerjaan mismatch (${statPengerjaan} !== selesai)`);
            return;
          }
        }
        // apply legend filter
        if (legendFilter !== 'all' && normalizeSeverity(jenis) !== legendFilter) {
          console.log(`[map.js] Skipping ${row.nama_jalan}: legend mismatch`);
          return;
        }

        // Build popup
        const popup = renderPopupContent(row);

        const baseIcon = createSeverityIcon(jenis);
        const marker = L.marker([lat, lng], { icon: baseIcon });

        // Bind popup dengan ukuran yang sesuai (klik untuk membuka)
        // Ensure popup stays within the visible map area and does not cross the header
        marker.bindPopup(popup, {
          maxWidth: 320,
          minWidth: 240,
          keepInView: true,
          autoPan: true,
          // Add top padding so popup won't be pushed under fixed header/overlays
          autoPanPaddingTopLeft: [12, 90],   // left, top
          autoPanPaddingBottomRight: [12, 12],
          offset: [0, -12]
        });
        // Pastikan popup terbuka saat marker diklik (mobile-friendly)
        marker.on('click', function() {
          if (window._map) window._map.closePopup();
          marker.openPopup();
        });

        // Tooltip akan sticky saat hover; tidak perlu open/close manual

        marker.on('popupopen', () => {
          console.log('[map.js] Popup opened for:', row.nama_jalan);
        });

        window._damageLayer.addLayer(marker);
        renderedMarkers++;
        console.log(`[map.js] ✓ Rendered marker for ${row.nama_jalan}`);

        // Jika status 'proses', tambahkan overlay ikon proses yang lebih kecil di atas marker awal
        const statusPengerjaan = normalizePengerjaan(getVal(row, 'status_pengerjaan', 'statusPengerjaan', 'Status Pengerjaan', 'status pengerjaan')) || '';
        if (statusPengerjaan === 'proses') {
          const overlayIcon = getMarkerIconProsesSmall();
          const overlay = L.marker([lat, lng], { icon: overlayIcon, zIndexOffset: 1000 });
          overlay.bindPopup(popup, {
            maxWidth: 320,
            minWidth: 240,
            keepInView: true,
            autoPan: true,
            autoPanPaddingTopLeft: [12, 90],
            autoPanPaddingBottomRight: [12, 12],
            offset: [0, -12]
          });
          overlay.on('click', function() {
            if (window._map) window._map.closePopup();
            overlay.openPopup();
          });
          window._damageLayer.addLayer(overlay);
        } else if (statusPengerjaan === 'selesai') {
          // Ganti ikon base dengan ikon selesai
          marker.setIcon(getMarkerIconSelesai());
        }
      });

      // update stats UI (both desktop and mobile views)
      const statActiveEl = document.getElementById('statActive');
      const statProcessingEl = document.getElementById('statProcessing');
      const statCompletedEl = document.getElementById('statCompleted');
      const statActiveMobileEl = document.getElementById('statActiveMobile');
      const statProcessingMobileEl = document.getElementById('statProcessingMobile');
      const statCompletedMobileEl = document.getElementById('statCompletedMobile');
      
      if (statActiveEl) statActiveEl.textContent = countActive;
      if (statProcessingEl) statProcessingEl.textContent = countProcessing;
      if (statCompletedEl) statCompletedEl.textContent = countCompleted;
      if (statActiveMobileEl) statActiveMobileEl.textContent = countActive;
      if (statProcessingMobileEl) statProcessingMobileEl.textContent = countProcessing;
      if (statCompletedMobileEl) statCompletedMobileEl.textContent = countCompleted;

      console.log(`[map.js] Successfully loaded ${validMarkers} valid markers out of ${data.length} records`);
      console.log(`[map.js] Rendered ${renderedMarkers} markers after filtering`);
      console.log('[map.js] Total markers on map:', window._damageLayer.getLayers().length);
      
      if (validMarkers === 0) {
        console.warn('[map.js] No valid markers found! Check if Latitude/Longitude columns have data.');
      }
    } catch (err) {
      console.error('[map.js] load error', err);
    }
  }

  // Open modal and fill details
  function openReportModal(row) {
    const kode = getVal(row, 'kode_titik_jalan', 'kode_titik', 'kode_titik_jalan') || '-';
    const nama = getVal(row, 'nama_jalan') || '-';
    const jenis = getVal(row, 'jenis_kerusakan') || '-';
    const tanggal = getVal(row, 'tanggal_survey') || '-';
    const status = getVal(row, 'status') || '-';
    const foto = buildPublicUrl(getVal(row, 'foto_jalan')) || '';

    document.getElementById('reportId').textContent = kode;
    document.getElementById('reportLocation').textContent = nama;
    document.getElementById('damageType').textContent = jenis;
    document.getElementById('reportPriority').textContent = (row.priority || '-');
    document.getElementById('reportStatus').textContent = status;
    document.getElementById('reportedBy').textContent = (row.reporter || '-');
    document.getElementById('reportDate').textContent = tanggal;
    document.getElementById('reportDescription').textContent = (row.description || '-');

    // show modal
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'block';
  }

  // close modal handlers
  (function setupModal() {
    const modal = document.getElementById('reportModal');
    const closeBtn = document.querySelector('.modal .close');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  })();

  // Wire UI events (filters, layer toggles, map controls)
  function setupUIHandlers() {
    // Filter changes
    const dmgSelect = document.getElementById('damageType');
    const statusSelect = document.getElementById('statusFilter');
    const statusPengerjaanSelect = document.getElementById('statusPengerjaanFilter');
    if (dmgSelect) dmgSelect.addEventListener('change', loadMarkersFromSupabase);
    if (statusSelect) statusSelect.addEventListener('change', loadMarkersFromSupabase);
    if (statusPengerjaanSelect) statusPengerjaanSelect.addEventListener('change', loadMarkersFromSupabase);

    // Layer toggles (damage / maintenance)
    const damageCheckbox = document.getElementById('damage');
    if (damageCheckbox) damageCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) window._map.addLayer(window._damageLayer); 
      else window._map.removeLayer(window._damageLayer);
    });

    // Custom zoom buttons
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const locateBtn = document.getElementById('locate');
    
    if (zoomInBtn) {
      const zoomIn = () => { if (window._map) window._map.zoomIn(); };
      zoomInBtn.addEventListener('click', zoomIn);
      zoomInBtn.addEventListener('touchstart', (e) => { e.preventDefault(); zoomIn(); }, { passive: false });
    }
    
    if (zoomOutBtn) {
      const zoomOut = () => { if (window._map) window._map.zoomOut(); };
      zoomOutBtn.addEventListener('click', zoomOut);
      zoomOutBtn.addEventListener('touchstart', (e) => { e.preventDefault(); zoomOut(); }, { passive: false });
    }
    
    if (locateBtn) {
      const locate = () => {
        // Show loading state
        const icon = locateBtn.querySelector('i');
        if (icon) {
          icon.className = 'fas fa-spinner fa-spin';
          locateBtn.disabled = true;
        }
        autoLocateUserWithBounds(window._map, boundsPalu);
        // Reset button after 2 seconds
        setTimeout(() => {
          if (icon) {
            icon.className = 'fas fa-crosshairs';
            locateBtn.disabled = false;
          }
        }, 2000);
      };
      locateBtn.addEventListener('click', locate);
      locateBtn.addEventListener('touchstart', (e) => { e.preventDefault(); locate(); }, { passive: false });
    }
    
    // Mobile: Toggle map tools sidebar via tools dropdown
    const toolsToggle = document.getElementById('toolsToggle');
    const mapSidebar = document.querySelector('.map-box-container .sidebar');
    
    if (toolsToggle && mapSidebar) {
      toolsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        mapSidebar.classList.toggle('mobile-open');
        
        // Toggle chevron icon
        const chevron = toolsToggle.querySelector('.fa-chevron-down, .fa-chevron-up');
        if (chevron) {
          chevron.classList.toggle('fa-chevron-down');
          chevron.classList.toggle('fa-chevron-up');
        }
      });
      
      // Close sidebar when clicking outside (mobile only)
      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) {
          if (!mapSidebar.contains(e.target) && !toolsToggle.contains(e.target)) {
            mapSidebar.classList.remove('mobile-open');
            const chevron = toolsToggle.querySelector('.fa-chevron-up');
            if (chevron) {
              chevron.classList.remove('fa-chevron-up');
              chevron.classList.add('fa-chevron-down');
            }
          }
        }
      });
    }

    // --- Mobile bottom bar chips ---
    const sidebarEl = document.querySelector('.map-box-container .sidebar');
    function openSidebarAndFocus(sectionTitle) {
      if (!sidebarEl) return;
      if (!sidebarEl.classList.contains('mobile-open')) sidebarEl.classList.add('mobile-open');
      // try to focus by heading text
      const headers = Array.from(sidebarEl.querySelectorAll('h3'));
      const target = headers.find(h => h.textContent.trim().toLowerCase() === sectionTitle.toLowerCase());
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // rotate chevron on toolsToggle to "open" state
      const chevron = toolsToggle?.querySelector('.fa-chevron-down, .fa-chevron-up');
      if (chevron && chevron.classList.contains('fa-chevron-down')) {
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-up');
      }
      // keep map sized
      if (window._map) setTimeout(() => window._map.invalidateSize(), 150);
    }

    const chipStats = document.getElementById('chipStats');
    const chipTools = document.getElementById('chipTools');
    const chipLegend = document.getElementById('chipLegend');
    const chipLocate = document.getElementById('chipLocate');
    const chipZoomIn = document.getElementById('chipZoomIn');

    const addTap = (el, cb) => {
      if (!el) return;
      el.addEventListener('click', cb);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); cb(); }, { passive: false });
    };
    addTap(chipStats, () => openSidebarAndFocus('Statistik'));
    addTap(chipTools, () => openSidebarAndFocus('Alat Peta'));
    addTap(chipLegend, () => openSidebarAndFocus('Legenda'));
    addTap(chipLocate, () => {
      const btn = document.getElementById('locate');
      if (btn) btn.click();
    });
    addTap(chipZoomIn, () => {
      const btn = document.getElementById('zoomIn');
      if (btn) btn.click();
    });
  }

  // User marker icon (blue pin, like screenshot)
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

  // Auto-locate user position dengan pengecekan bounds (watch for better accuracy)
  function autoLocateUserWithBounds(map, bounds) {
    if (navigator.geolocation) {
      console.log('[map.js] Attempting to locate user position...');
      
      // Clear previous watch
      if (window._geoWatchId) {
        try { navigator.geolocation.clearWatch(window._geoWatchId); } catch (_) {}
        window._geoWatchId = null;
      }

      const TARGET_ACCURACY = 50; // meters
      const WATCH_TIMEOUT_MS = 15000; // stop watch after 15s if not good enough
      let best = null; // {lat,lng,accuracy}

      function applyPosition(lat, lng, accuracy) {
        const userLatLng = L.latLng(lat, lng);
        // Create/update marker
        if (!window._userMarker) {
          window._userMarker = L.marker([lat, lng], { icon: getUserLocationIcon() }).addTo(map);
        } else {
          window._userMarker.setLatLng([lat, lng]);
        }
        // Remove accuracy circle if previously created (user prefers no circle)
        if (window._userAccuracyCircle) {
          try { map.removeLayer(window._userAccuracyCircle); } catch(_) {}
          window._userAccuracyCircle = null;
        }

        const inside = bounds.contains(userLatLng);
        map.setView([lat, lng], inside ? 15 : 13);
        if (!inside) showToast('Lokasi Anda di luar area Palu – peta tetap dipusatkan ke posisi Anda.', 'info');
      }

      const onSuccess = (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = position.coords.accuracy || 9999;
        console.log(`[map.js] watchPosition: ${lat}, ${lng} (±${acc}m)`);
        // Keep best reading
        if (!best || acc < best.accuracy) best = { lat, lng, accuracy: acc };
        applyPosition(lat, lng, acc);
        if (acc <= TARGET_ACCURACY) {
          // good enough; stop watching
          if (window._geoWatchId) { navigator.geolocation.clearWatch(window._geoWatchId); window._geoWatchId = null; }
          showToast('Lokasi akurat ditemukan.', 'success');
        }
      };

      const onError = (error) => {
        console.warn('[map.js] Geolocation failed:', error.message, error);
        showToast('Tidak bisa mengambil lokasi perangkat. Pastikan izin lokasi diaktifkan.', 'error');
      };

      // Start watching with high accuracy
      try {
        window._geoWatchId = navigator.geolocation.watchPosition(onSuccess, onError, {
          enableHighAccuracy: true,
          timeout: WATCH_TIMEOUT_MS,
          maximumAge: 0
        });
      } catch (e) {
        console.warn('[map.js] watchPosition unsupported, fallback to getCurrentPosition');
        navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      }

      // Hard stop the watch after timeout to save battery
      setTimeout(() => {
        if (window._geoWatchId) { navigator.geolocation.clearWatch(window._geoWatchId); window._geoWatchId = null; }
        if (best) {
          if (best.accuracy > TARGET_ACCURACY) showToast('Akurasi lokasi rendah, posisi terbaik ditampilkan.', 'info');
        }
      }, WATCH_TIMEOUT_MS + 1000);
      
      
      
        
    }
  }

  // Location selection mode untuk form laporan
  function enableLocationSelectionMode() {
    console.log('[map.js] Location selection mode enabled');
    
    // Tampilkan notifikasi
    const notification = document.createElement('div');
    notification.id = 'locationSelectNotif';
    notification.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-weight: 500;';
    notification.innerHTML = '<i class="fas fa-map-marker-alt"></i> Klik pada peta untuk memilih lokasi';
    document.body.appendChild(notification);
    
    // Tambahkan marker sementara untuk selection
    let selectionMarker = null;
    
    // Handler untuk klik peta
    const clickHandler = (e) => {
      const { lat, lng } = e.latlng;
      
      console.log(`[map.js] Location selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      
      // Hapus marker lama
      if (selectionMarker) {
        window._map.removeLayer(selectionMarker);
      }
      
      // Tambah marker baru
      selectionMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'selection-marker',
          html: '<i class="fas fa-map-pin" style="color: #e74c3c; font-size: 36px;"></i>',
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        })
      }).addTo(window._map);
      
      // Update notifikasi
      notification.innerHTML = `<i class="fas fa-check-circle"></i> Lokasi dipilih! Mengalihkan ke form...`;
      notification.style.background = '#28a745';
      
      // Auto redirect ke report.html dengan koordinat di URL params
      setTimeout(() => {
        window.location.href = `report.html?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`;
      }, 800); // Delay 0.8s untuk user melihat konfirmasi
    };
    
    window._map.on('click', clickHandler);
    
    // Simpan handler untuk cleanup
    window._locationSelectHandler = clickHandler;
  }
  
  // Cek apakah mode selection aktif (dari query parameter)
  function checkLocationSelectionMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectLocation') === 'true') {
      enableLocationSelectionMode();
    }
  }

  // Mobile sidebar toggle
  function setupMobileSidebar() {
    const sidebar = document.getElementById('mapSidebar');
    const toggle = document.getElementById('sidebarToggle');
    const backdrop = document.getElementById('sidebarBackdrop');
    
    if (!sidebar || !toggle || !backdrop) return;
    
    // Toggle sidebar
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      backdrop.classList.toggle('active');
    });
    
    // Close sidebar when clicking backdrop
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('active');
      backdrop.classList.remove('active');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 900) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target) && sidebar.classList.contains('active')) {
          sidebar.classList.remove('active');
          backdrop.classList.remove('active');
        }
      }
    });
  }

  // Initial load
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[map.js] DOM loaded, initializing map...');
    ensureTooltipStyles();
    initializeMap(); // Initialize map FIRST
    setupUIHandlers();
    setupMobileSidebar(); // Setup mobile sidebar toggle
    setupHamburgerMenu(); // Mobile hamburger -> quick actions
    setupResizeInvalidate(); // Keep map sized on viewport changes
    loadMarkersFromSupabase();
    checkLocationSelectionMode(); // Cek mode selection
    // expose refresh fn
    window.refreshJalanRusakMarkers = loadMarkersFromSupabase;
  });

  // Auto-refresh markers when page becomes visible (e.g., switching back from reports page)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[map.js] Page visible, refreshing markers...');
      loadMarkersFromSupabase();
    }
  });

})();
