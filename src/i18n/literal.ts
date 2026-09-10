import ui from './ui.json'
export type SupportedLocale = 'en' | 'ms' | 'zh'

// Legacy screens pre-date the key-based translator. Keeping their labels here
// lets the language switch cover dialogs and tabs while those screens are
// progressively migrated to explicit t() keys.
const ms: Record<string, string> = {
  'Academic Calendar':'Kalendar Akademik', 'Active Trips':'Perjalanan Aktif', 'Add Bus':'Tambah Bas', '+ Add Bus':'+ Tambah Bas',
  'Add Route':'Tambah Laluan', '+ Add Route':'+ Tambah Laluan', 'Add Shift':'Tambah Syif', '+ Add Shift':'+ Tambah Syif',
  'Add Stop':'Tambah Hentian', 'Address':'Alamat', 'Admin':'Pentadbir', 'Afternoon Dropoff Time':'Waktu Hantar Petang',
  'All Organisations':'Semua Organisasi', 'All Roles':'Semua Peranan', 'All Routes':'Semua Laluan', 'Amount (RM) *':'Jumlah (RM) *',
  'Approaching School Zone':'Menghampiri Zon Sekolah', 'Assign Route':'Tetapkan Laluan', 'Attendance Overview':'Gambaran Kehadiran',
  'Attendance Rate':'Kadar Kehadiran', 'Attendance Trend (7 Days)':'Trend Kehadiran (7 Hari)', 'Available Pickup Times':'Waktu Pengambilan Tersedia',
  'Before':'Sebelum', 'After':'Selepas', 'Broadcast Announcement':'Hebahan Pengumuman', 'Bus Plate':'Nombor Plat Bas',
  'Capacity (seats)':'Kapasiti (tempat duduk)', 'Choose a route...':'Pilih laluan...', 'Close':'Tutup', 'Color Theme':'Tema Warna',
  'Compose a message to a driver or parent.':'Tulis mesej kepada pemandu atau ibu bapa.', 'Confirming your payment…':'Mengesahkan pembayaran anda…',
  'Description':'Penerangan', 'Digital Boarding Pass':'Pas Menaiki Digital', 'Driver':'Pemandu', 'Driver (Optional)':'Pemandu (Pilihan)',
  'Driver GPS Status':'Status GPS Pemandu', 'Driver Shift Schedule':'Jadual Syif Pemandu', 'Driver Workspace Setup':'Persediaan Ruang Kerja Pemandu',
  'Email':'Emel', 'End Date (Optional)':'Tarikh Tamat (Pilihan)', 'ETA to School':'Anggaran Masa ke Sekolah', 'Event Title *':'Tajuk Acara *',
  'Failed to load analytics.':'Gagal memuatkan analitik.', 'Fleet (Buses)':'Armada (Bas)', 'Fleet Maintenance':'Penyelenggaraan Armada',
  'Full Name *':'Nama Penuh *', 'Geofence Radius (metres)':'Radius Geopagar (meter)', 'Grade *':'Darjah *',
  'Inbox':'Peti Masuk', 'Language / Bahasa / 语言':'Bahasa', 'Level':'Peringkat',
  'Live Control Center':'Pusat Kawalan Langsung', 'Loading fleet...':'Memuatkan armada...', 'Loading…':'Memuatkan…',
  'Log Maintenance':'Rekod Penyelenggaraan', 'Login Email':'Emel Log Masuk', 'Lost & Found':'Hilang & Jumpa',
  'Management of school holidays, exams, and special events':'Pengurusan cuti sekolah, peperiksaan dan acara khas',
  'Message':'Mesej', 'Message *':'Mesej *', 'Messages':'Mesej', 'Min. 3 characters':'Minimum 3 aksara',
  'Morning Pickup Time':'Waktu Ambil Pagi', 'Name':'Nama', 'NEW':'BAHARU', 'Next Week →':'Minggu Depan →',
  '← Prev':'← Sebelum', 'No activity yet':'Belum ada aktiviti', 'No drivers registered yet.':'Belum ada pemandu didaftarkan.',
  'No maintenance records. Fleet is healthy!':'Tiada rekod penyelenggaraan. Armada dalam keadaan baik!', 'No messages yet':'Belum ada mesej',
  'No organisation (global)':'Tiada organisasi (global)', 'No organisations yet':'Belum ada organisasi', 'No parent account linked':'Tiada akaun ibu bapa dipautkan',
  'No reports yet — that’s great!':'Belum ada laporan — bagus!', 'No route (self-pickup)':'Tiada laluan (ambil sendiri)',
  'No Signal':'Tiada Isyarat', 'No students at this stop.':'Tiada pelajar di hentian ini.', 'No trip history yet.':'Belum ada sejarah perjalanan.',
  'No trips found':'Tiada perjalanan ditemui', 'No trips on this date':'Tiada perjalanan pada tarikh ini', 'No trips yet':'Belum ada perjalanan',
  'Notification Breakdown':'Pecahan Pemberitahuan', 'Open Emergencies':'Kecemasan Aktif', 'Optimized Stop Order':'Susunan Hentian Dioptimumkan',
  'Organisation Name':'Nama Organisasi', 'Organisation Name *':'Nama Organisasi *', 'Organisation Settings':'Tetapan Organisasi',
  'Parent':'Ibu Bapa', 'Parent / Guardian':'Ibu Bapa / Penjaga', 'Past Announcements':'Pengumuman Lepas',
  'Payment confirmed!':'Pembayaran disahkan!', 'Payment not completed':'Pembayaran tidak selesai', 'Phone':'Telefon', 'Phone Number':'Nombor Telefon',
  'Pickup Method':'Kaedah Pengambilan', 'Plate Number':'Nombor Plat', 'Primary':'Rendah', 'Primary Contact *':'Telefon Utama *',
  'Priority':'Keutamaan', 'Ready to Roll?':'Sedia Bergerak?', 'Report Lost Item':'Lapor Barang Hilang', 'Rider Level':'Tahap Penumpang',
  'Route (Optional)':'Laluan (Pilihan)', 'Route Name':'Nama Laluan', 'Route Stops':'Hentian Laluan', 'Routes':'Laluan',
  'Save':'Simpan', 'Saved':'Disimpan', 'Scan Bus QR':'Imbas QR Bas', 'School Admin':'Pentadbir Sekolah',
  'School Latitude':'Latitud Sekolah', 'School Longitude':'Longitud Sekolah', 'Secondary':'Menengah', 'Secondary Contact':'Telefon Kedua',
  'Select Bus':'Pilih Bas', 'Select Driver':'Pilih Pemandu', '-- Select Driver --':'-- Pilih Pemandu --',
  'Select level':'Pilih peringkat', 'Select recipient…':'Pilih penerima…', 'Select Route':'Pilih Laluan', '-- Select Route --':'-- Pilih Laluan --',
  'Self-Pickup':'Ambil Sendiri', 'Send Invoice':'Hantar Invois', 'Send Message':'Hantar Mesej', 'Send To *':'Hantar Kepada *',
  'Show this to the driver for boarding':'Tunjukkan kepada pemandu untuk menaiki bas', 'Speed':'Kelajuan', 'Start Date *':'Tarikh Mula *',
  'Still processing':'Masih diproses', 'Student Roster':'Senarai Pelajar', 'Student Status Breakdown':'Pecahan Status Pelajar',
  'Students Overview':'Gambaran Pelajar', 'Submit Report':'Hantar Laporan', 'Super Admin':'Pentadbir Utama', 'Target Audience':'Kumpulan Sasaran',
  'Temporary Password':'Kata Laluan Sementara', 'This Week':'Minggu Ini', 'Title':'Tajuk', 'Total Students (all orgs)':'Jumlah Pelajar (semua organisasi)',
  'Trip History':'Sejarah Perjalanan', 'Trips by Day of Week':'Perjalanan Mengikut Hari', 'Type':'Jenis',
  'Visible to Parents & Students':'Boleh dilihat oleh Ibu Bapa & Pelajar', 'Add Student':'Tambah Pelajar', 'Edit Student':'Edit Pelajar',
  'Register Student':'Daftar Pelajar', 'Add New User':'Tambah Pengguna Baharu', 'Edit User':'Edit Pengguna', 'Cancel':'Batal',
  'Save Changes':'Simpan Perubahan', 'Save Student':'Simpan Pelajar', 'Save Bus':'Simpan Bas', 'Save Route':'Simpan Laluan',
  'Generate Invoice':'Jana Invois', 'Recent Trips':'Perjalanan Terkini', 'Report late':'Lapor Lewat', 'Offline':'Luar Talian',
}

const zh: Record<string, string> = {
  'Academic Calendar':'校历', 'Active Trips':'当前行程', 'Add Bus':'添加校车', '+ Add Bus':'+ 添加校车', 'Add Route':'添加路线', '+ Add Route':'+ 添加路线',
  'Add Shift':'添加班次', '+ Add Shift':'+ 添加班次', 'Add Stop':'添加站点', 'Address':'地址', 'Admin':'管理员',
  'Afternoon Dropoff Time':'下午送达时间', 'All Organisations':'所有组织', 'All Roles':'所有角色', 'All Routes':'所有路线', 'Amount (RM) *':'金额（RM）*',
  'Approaching School Zone':'接近学校区域', 'Assign Route':'分配路线', 'Attendance Overview':'出勤概览', 'Attendance Rate':'出勤率',
  'Attendance Trend (7 Days)':'出勤趋势（7天）', 'Available Pickup Times':'可选接送时间', 'Before':'之前', 'After':'之后',
  'Broadcast Announcement':'发布公告', 'Bus Plate':'校车车牌', 'Capacity (seats)':'载客量（座位）', 'Choose a route...':'选择路线…',
  'Close':'关闭', 'Color Theme':'颜色主题', 'Compose a message to a driver or parent.':'给司机或家长发送消息。', 'Confirming your payment…':'正在确认付款…',
  'Description':'描述', 'Digital Boarding Pass':'电子乘车证', 'Driver':'司机', 'Driver (Optional)':'司机（可选）', 'Driver GPS Status':'司机 GPS 状态',
  'Driver Shift Schedule':'司机排班', 'Driver Workspace Setup':'司机工作区设置', 'Email':'电子邮件', 'End Date (Optional)':'结束日期（可选）',
  'ETA to School':'预计到校时间', 'Event Title *':'活动标题 *', 'Failed to load analytics.':'无法加载分析。', 'Fleet (Buses)':'车队（校车）',
  'Fleet Maintenance':'车队维护', 'Full Name *':'全名 *', 'Geofence Radius (metres)':'地理围栏半径（米）', 'Grade *':'年级 *',
  'Inbox':'收件箱', 'Language / Bahasa / 语言':'语言', 'Level':'阶段', 'Live Control Center':'实时控制中心',
  'Loading fleet...':'正在加载车队…', 'Loading…':'加载中…', 'Log Maintenance':'记录维护', 'Login Email':'登录邮箱', 'Lost & Found':'失物招领',
  'Management of school holidays, exams, and special events':'管理学校假期、考试和特别活动', 'Message':'消息', 'Message *':'消息 *',
  'Messages':'消息', 'Min. 3 characters':'至少 3 个字符', 'Morning Pickup Time':'早晨接送时间', 'Name':'姓名', 'NEW':'新',
  'Next Week →':'下周 →', '← Prev':'← 上一步', 'No activity yet':'暂无动态', 'No drivers registered yet.':'尚未注册司机。',
  'No maintenance records. Fleet is healthy!':'暂无维护记录，车队状态良好！', 'No messages yet':'暂无消息', 'No organisation (global)':'无组织（全局）',
  'No organisations yet':'尚无组织', 'No parent account linked':'未关联家长账户', 'No reports yet — that’s great!':'暂无报告，太好了！',
  'No route (self-pickup)':'无路线（自行接送）', 'No Signal':'无信号', 'No students at this stop.':'此站没有学生。',
  'No trip history yet.':'暂无行程历史。', 'No trips found':'未找到行程', 'No trips on this date':'该日期无行程', 'No trips yet':'暂无行程',
  'Notification Breakdown':'通知分类', 'Open Emergencies':'当前紧急事件', 'Optimized Stop Order':'优化后的站点顺序',
  'Organisation Name':'组织名称', 'Organisation Name *':'组织名称 *', 'Organisation Settings':'组织设置', 'Parent':'家长',
  'Parent / Guardian':'家长 / 监护人', 'Past Announcements':'历史公告', 'Payment confirmed!':'付款已确认！', 'Payment not completed':'付款未完成',
  'Phone':'电话', 'Phone Number':'电话号码', 'Pickup Method':'接送方式', 'Plate Number':'车牌号码', 'Primary':'小学', 'Primary Contact *':'主要联系电话 *',
  'Priority':'优先级', 'Ready to Roll?':'准备出发？', 'Report Lost Item':'报告失物', 'Rider Level':'乘车等级', 'Route (Optional)':'路线（可选）',
  'Route Name':'路线名称', 'Route Stops':'路线站点', 'Routes':'路线', 'Save':'保存', 'Saved':'已保存', 'Scan Bus QR':'扫描校车二维码',
  'School Admin':'学校管理员', 'School Latitude':'学校纬度', 'School Longitude':'学校经度', 'Secondary':'中学', 'Secondary Contact':'备用联系电话',
  'Select Bus':'选择校车', 'Select Driver':'选择司机', '-- Select Driver --':'-- 选择司机 --', 'Select level':'选择阶段',
  'Select recipient…':'选择收件人…', 'Select Route':'选择路线', '-- Select Route --':'-- 选择路线 --', 'Self-Pickup':'自行接送',
  'Send Invoice':'发送发票', 'Send Message':'发送消息', 'Send To *':'发送给 *', 'Show this to the driver for boarding':'上车时请向司机出示',
  'Speed':'速度', 'Start Date *':'开始日期 *', 'Still processing':'仍在处理中', 'Student Roster':'学生名单', 'Student Status Breakdown':'学生状态分布',
  'Students Overview':'学生概览', 'Submit Report':'提交报告', 'Super Admin':'超级管理员', 'Target Audience':'目标对象',
  'Temporary Password':'临时密码', 'This Week':'本周', 'Title':'标题', 'Total Students (all orgs)':'学生总数（所有组织）',
  'Trip History':'行程历史', 'Trips by Day of Week':'每周每日行程', 'Type':'类型', 'Visible to Parents & Students':'家长和学生可见',
  'Add Student':'添加学生', 'Edit Student':'编辑学生', 'Register Student':'注册学生', 'Add New User':'添加新用户', 'Edit User':'编辑用户',
  'Cancel':'取消', 'Save Changes':'保存更改', 'Save Student':'保存学生', 'Save Bus':'保存校车', 'Save Route':'保存路线',
  'Generate Invoice':'创建发票', 'Recent Trips':'最近行程', 'Report late':'报告迟到', 'Offline':'离线',
}

export function translateLiteral(value: string, locale: SupportedLocale): string {
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const core = value.trim()
  if (/^e\.g\.(?:,)?\s/.test(core)) return leading + (locale === 'ms' ? 'cth. ' : locale === 'zh' ? '例如：' : 'e.g. ') + core.replace(/^e\.g\.(?:,)?\s*/, '') + trailing
  const dictionary = ui as Record<string, { ms: string; zh: string }>
  const original = Object.entries(dictionary).find(([,v])=>v.ms === core || v.zh === core)?.[0] || core
  if (dictionary[original]) return leading + (locale === 'en' ? original : dictionary[original][locale]) + trailing
  const source = Object.entries(ms).find(([, translated]) => translated === core)?.[0]
    || Object.entries(zh).find(([, translated]) => translated === core)?.[0]
    || core
  if (locale === 'en') return `${leading}${source}${trailing}`
  const legacy = locale === 'ms' ? ms : zh
  return `${leading}${legacy[source] || source}${trailing}`
}
