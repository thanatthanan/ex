// ตัวแปรเก็บข้อมูลส่วนกลาง
const basePath = window.location.pathname.startsWith('/exapp') ? '/exapp' : '';
let currentUser = null;
let categoriesList = [];
let activeTransactionType = 'expense'; // ค่าเริ่มต้นเป็น 'รายจ่าย'
let categoryChartInstance = null;
let comparisonChartInstance = null;
let editTransactionId = null;
let editCreditStatus = 'none';
let currentTransactions = [];
let unpaidTransactionsList = [];
let activeCreditCardFilter = 'all';
let currentEVLogs = [];
let showAllEVLogs = false; // ค่าเริ่มต้นแสดงเฉพาะ 10 รายการล่าสุด

// ตัวแปร Pagination
let currentPage = 1;
let totalPages = 1;
const transactionsLimit = 15; // แสดงหน้าละ 15 รายการกำลังดี ดูสะอาดตาและน่ารัก

let currentLang = localStorage.getItem('lang') || 'th';

const monthNames = {
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};

function toggleLang() {
  const nextLang = currentLang === 'th' ? 'en' : 'th';
  currentLang = nextLang;
  document.documentElement.setAttribute('lang', nextLang);
  localStorage.setItem('lang', nextLang);
  applyLanguage(nextLang);
  
  // Re-fetch/render to update lists, stats, and filters
  setupFilters();
  fetchTransactions();
  fetchEVStatistics();
  fetchUnpaidCredits();
  
  // Update header and dropdown if user is logged in
  if (currentUser) {
    document.getElementById('headerDisplayName').textContent = getUserDisplayName(currentUser);
    fetchFamilyMembers(); // updates family filter display names
  }

  // Re-render charts
  const analyticsTab = document.getElementById('analytics-tab');
  if (analyticsTab && analyticsTab.classList.contains('active')) {
    renderAnalyticsCharts();
  }
}

function applyLanguage(lang) {
  // Update toggle button text
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) {
    langBtn.textContent = lang === 'th' ? 'EN' : 'TH';
  }

  // Update month filter select texts
  const filterMonthSelect = document.getElementById('filterMonth');
  if (filterMonthSelect) {
    const currentVal = filterMonthSelect.value;
    filterMonthSelect.innerHTML = '';
    const months = lang === 'th' ? monthNames.th : monthNames.en;
    months.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = index + 1;
      option.textContent = name;
      if (String(index + 1) === currentVal) option.selected = true;
      filterMonthSelect.appendChild(option);
    });
  }

  // Translate all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      if (key === 'logo_span') {
        el.innerHTML = translations[lang][key];
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });

  // Translate data-i18n-placeholder elements
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang] && translations[lang][key]) {
      el.setAttribute('placeholder', translations[lang][key]);
    }
  });

  // Update change password modal input placeholders
  const oldPassword = document.getElementById('oldPassword');
  if (oldPassword) {
    oldPassword.setAttribute('placeholder', lang === 'th' ? 'กรอกรหัสผ่านเดิม...' : 'Enter current password...');
  }
  const newPassword = document.getElementById('newPassword');
  if (newPassword) {
    newPassword.setAttribute('placeholder', lang === 'th' ? 'กรอกรหัสผ่านใหม่...' : 'Enter new password...');
  }
  const confirmNewPassword = document.getElementById('confirmNewPassword');
  if (confirmNewPassword) {
    confirmNewPassword.setAttribute('placeholder', lang === 'th' ? 'กรอกรหัสผ่านใหม่อีกครั้ง...' : 'Confirm new password...');
  }
}

function getCategoryName(catName) {
  const lang = localStorage.getItem('lang') || 'th';
  if (lang === 'en' && categoryTranslations.en && categoryTranslations.en[catName]) {
    return categoryTranslations.en[catName];
  }
  return catName;
}

function getUserDisplayName(user) {
  if (!user) return '';
  const lang = localStorage.getItem('lang') || 'th';
  if (user.username === 'dad' && translations[lang].login_dad) {
    return translations[lang].login_dad;
  }
  if (user.username === 'mom' && translations[lang].login_mom) {
    return translations[lang].login_mom;
  }
  if (user.username === 'kid' && translations[lang].login_kid) {
    return translations[lang].login_kid;
  }
  return user.displayName || user.display_name;
}

// Theme functions
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);

  // Re-render charts to update text/line colors if analytics tab is active
  const analyticsTab = document.getElementById('analytics-tab');
  if (analyticsTab && analyticsTab.classList.contains('active')) {
    renderAnalyticsCharts();
  }
}

function updateThemeIcon(isDark) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  }
}

// ไอคอนอวตารน่ารักๆ
const avatarMap = {
  'dad': '👨',
  'mom': '👩',
  'kid': '👦',
  'default': '🏠'
};

// เมื่อหน้าเว็บโหลดเสร็จ
window.onload = async () => {
  // Initialize Theme Icon
  updateThemeIcon(document.documentElement.classList.contains('dark-mode'));

  // Initialize Language UI
  applyLanguage(currentLang);

  // 1. ตรวจสอบการล็อกอิน
  const isLoggedIn = await checkAuth();
  if (!isLoggedIn) return;

  // 2. ตั้งควันวันที่เริ่มต้นในฟอร์มเป็น วันนี้
  setTodayDate();

  // 3. ตั้งค่าปีและเดือนในส่วนตัวกรองเป็น เดือน/ปี ปัจจุบัน
  setupFilters(true);

  // 4. ดึงข้อมูลหมวดหมู่และสมาชิกในครอบครัว
  await Promise.all([
    fetchCategories(),
    fetchFamilyMembers()
  ]);

  // 5. โหลดรายการการเงินล่าสุด
  await fetchTransactions();

  // 6. ตั้งค่าการจัดหน้าและแท็บเริ่มต้นตามอุปกรณ์
  handleResponsiveLayout();
  window.addEventListener('resize', handleResponsiveLayout);
  
  if (window.innerWidth <= 600) {
    switchTab('form-tab');
  }

  // Re-apply language to translate dynamic values loaded from filters and categories
  applyLanguage(currentLang);
};

// เช็คล็อกอิน
async function checkAuth() {
  try {
    const res = await fetch(basePath + '/api/auth/me');
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      if (currentUser.avatar && (currentUser.avatar.startsWith('http://') || currentUser.avatar.startsWith('https://'))) {
        document.getElementById('headerAvatar').innerHTML = `<img src="${currentUser.avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Avatar">`;
      } else {
        document.getElementById('headerAvatar').textContent = avatarMap[currentUser.avatar] || '🏠';
      }
      document.getElementById('headerDisplayName').textContent = getUserDisplayName(currentUser);
      return true;
    } else {
      window.location.href = basePath + '/login';
      return false;
    }
  } catch (error) {
    console.error('Auth error:', error);
    window.location.href = basePath + '/login';
    return false;
  }
}

// ตั้งค่าวันที่เริ่มต้น
function setTodayDate() {
  const dateInput = document.getElementById('transactionDate');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;

  const creditPayDate = document.getElementById('creditPayDate');
  if (creditPayDate) {
    creditPayDate.value = `${yyyy}-${mm}-${dd}`;
  }
}

// ตั้งค่าตัวกรองเริ่มต้น
function setupFilters(isInitial = false) {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // ตั้งค่าเดือน
  const filterMonthSelect = document.getElementById('filterMonth');
  if (filterMonthSelect) {
    if (isInitial || !filterMonthSelect.value) {
      filterMonthSelect.value = currentMonth;
    }
  }

  // ตั้งค่าปี (ย้อนหลัง 2 ปี และไปข้างหน้า 1 ปี)
  const filterYearSelect = document.getElementById('filterYear');
  if (filterYearSelect) {
    const selectedYear = (isInitial || !filterYearSelect.value) ? currentYear : parseInt(filterYearSelect.value);
    filterYearSelect.innerHTML = '';
    const lang = localStorage.getItem('lang') || 'th';
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = lang === 'th' ? y + 543 : y; // แปลงเป็น พ.ศ. หรือ ค.ศ.
      if (y === selectedYear) option.selected = true;
      filterYearSelect.appendChild(option);
    }
  }
}

// ดึงหมวดหมู่ทั้งหมด
async function fetchCategories() {
  try {
    const res = await fetch(basePath + '/api/transactions/categories');
    const data = await res.json();
    if (data.success) {
      categoriesList = data.categories;
      populateCategoryDropdown();
    }
  } catch (e) {
    console.error('Error fetching categories:', e);
  }
}

// ดึงสมาชิกครอบครัว
async function fetchFamilyMembers() {
  try {
    const res = await fetch(basePath + '/api/auth/users');
    const data = await res.json();
    if (data.success) {
      const userFilter = document.getElementById('filterUser');
      userFilter.innerHTML = ''; // ล้างตัวเลือกทั้งหมดออกก่อน
      data.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        const avatarEmoji = (user.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://'))) 
          ? '🖼️' 
          : (avatarMap[user.avatar] || '👤');
        option.textContent = `${avatarEmoji} ${getUserDisplayName(user)}`;
        userFilter.appendChild(option);
      });
      // ตั้งค่าเริ่มต้นของตัวกรองให้ตรงกับผู้ใช้งานที่ล็อกอินอยู่
      if (currentUser) {
        userFilter.value = currentUser.id;
      }
    }
  } catch (e) {
    console.error('Error fetching users:', e);
  }
}

// เติมตัวเลือกใน Dropdown หมวดหมู่ตามประเภทธุรกรรม (รายรับ/รายจ่าย)
// เติมตัวเลือกใน Dropdown หมวดหมู่ตามประเภทธุรกรรม (รายรับ/รายจ่าย)
function populateCategoryDropdown() {
  clearCategorySearch();
  // ล้างการแสดงผลฟิลด์รถ EV และ มื้ออาหาร ทุกครั้งที่เปลี่ยนประเภท
  const evSection = document.getElementById('evDetailsSection');
  if (evSection) evSection.classList.remove('show');
  const mealGroup = document.getElementById('mealTypeGroup');
  if (mealGroup) mealGroup.style.display = 'none';
  const recipientGroup = document.getElementById('recipientGroup');
  if (recipientGroup) recipientGroup.style.display = 'none';
}

function clearCategorySearch() {
  const searchInput = document.getElementById('categorySearchInput');
  const categoryId = document.getElementById('categoryId');
  if (searchInput) searchInput.value = '';
  if (categoryId) categoryId.value = '';
  checkSelectedCategoryName(''); // ซ่อนฟิลด์รถ EV, มื้ออาหาร, และผู้ได้รับเงิน
}

// โค้ดสำหรับดึงข้อมูลเมื่อเลือกหมวดหมู่หลัก (ไม่ใช้แล้วแต่ยังเก็บฟังก์ชันไว้ป้องกัน JS Error)
function onMainCategoryChange() {}

// Show all suggestions for the current transaction type
function showCategorySuggestions() {
  const suggestionsBox = document.getElementById('categorySuggestions');
  const searchInput = document.getElementById('categorySearchInput');
  if (!suggestionsBox || !searchInput) return;
  
  const container = searchInput.closest('.category-search-container');
  const filtered = categoriesList.filter(c => c.type === activeTransactionType);
  renderCategorySuggestions(filtered);
  
  suggestionsBox.classList.add('show');
  if (container) container.classList.add('active');
}

// Filter suggestions based on typed input
function filterCategorySuggestions() {
  const searchInput = document.getElementById('categorySearchInput');
  const suggestionsBox = document.getElementById('categorySuggestions');
  if (!searchInput || !suggestionsBox) return;
  
  const query = searchInput.value.toLowerCase().trim();
  const filtered = categoriesList.filter(c => {
    if (c.type !== activeTransactionType) return false;
    
    const translatedName = getCategoryName(c.name).toLowerCase();
    const originalName = c.name.toLowerCase();
    
    const translatedParent = c.parent_category ? getCategoryName(c.parent_category).toLowerCase() : '';
    const originalParent = c.parent_category ? c.parent_category.toLowerCase() : '';
    
    const nameMatch = originalName.includes(query) || translatedName.includes(query);
    const parentMatch = originalParent.includes(query) || translatedParent.includes(query);
    
    return nameMatch || parentMatch;
  });
  
  renderCategorySuggestions(filtered);
}

// Render the suggestion items list
function renderCategorySuggestions(list) {
  const suggestionsBox = document.getElementById('categorySuggestions');
  if (!suggestionsBox) return;
  
  suggestionsBox.innerHTML = '';
  
  const lang = localStorage.getItem('lang') || 'th';
  if (list.length === 0) {
    const noCatText = lang === 'th' ? '❌ ไม่พบหมวดหมู่ที่ต้องการ' : '❌ No categories found';
    suggestionsBox.innerHTML = `<div class="no-suggestions">${noCatText}</div>`;
    return;
  }
  
  list.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    
    // Background color with opacity for the icon box
    const iconBgColor = hexToRgba(cat.color || '#888888', 0.15);
    const iconColor = cat.color || '#888888';
    const iconClass = cat.icon || 'fa-question';
    
    const translatedParent = cat.parent_category ? getCategoryName(cat.parent_category) : (lang === 'th' ? 'หมวดหมู่ทั่วไป' : 'General Category');
    const translatedName = getCategoryName(cat.name);
    
    item.innerHTML = `
      <div class="suggestion-icon" style="background-color: ${iconBgColor}; color: ${iconColor};">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="suggestion-text">
        <span class="suggestion-parent">${translatedParent}</span>
        <span class="suggestion-name">${translatedName}</span>
      </div>
    `;
    
    item.onclick = (e) => {
      e.stopPropagation();
      selectCategory(cat);
    };
    
    suggestionsBox.appendChild(item);
  });
}

// Helper to convert hex to rgba
function hexToRgba(hex, alpha) {
  let c;
  if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
    c= hex.substring(1).split('');
    if(c.length== 3){
      c= [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c= '0x' + c.join('');
    return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
  }
  return 'rgba(0,0,0,'+alpha+')';
}

// Handle category selection
function selectCategory(cat) {
  const searchInput = document.getElementById('categorySearchInput');
  const categoryId = document.getElementById('categoryId');
  const suggestionsBox = document.getElementById('categorySuggestions');
  const container = document.querySelector('.category-search-container');
  
  if (searchInput && categoryId) {
    const lang = localStorage.getItem('lang') || 'th';
    const parentText = cat.parent_category ? getCategoryName(cat.parent_category) : (lang === 'th' ? 'หมวดหมู่หลัก' : 'Main Category');
    searchInput.value = `${parentText} ➔ ${getCategoryName(cat.name)}`;
    categoryId.value = cat.id;
  }
  
  if (suggestionsBox) suggestionsBox.classList.remove('show');
  if (container) container.classList.remove('active');
  
  checkSelectedCategoryName(cat.name);
}

// Close suggestion dropdown when clicking outside
document.addEventListener('click', function(e) {
  const suggestionsBox = document.getElementById('categorySuggestions');
  const searchInput = document.getElementById('categorySearchInput');
  const container = document.querySelector('.category-search-container');
  
  if (suggestionsBox && searchInput) {
    if (!suggestionsBox.contains(e.target) && e.target !== searchInput) {
      suggestionsBox.classList.remove('show');
      if (container) container.classList.remove('active');
    }
  }
});

// เปลี่ยนปุ่มสวิตช์ประเภท รายรับ - รายจ่าย
function setTransactionType(type) {
  activeTransactionType = type;
  
  // สลับการไฮไลท์ปุ่ม
  const btns = document.querySelectorAll('.type-selector button');
  btns.forEach(btn => btn.classList.remove('active'));
  
  const paymentMethodGroup = document.getElementById('paymentMethodGroup');
  const paymentMethod = document.getElementById('paymentMethod');

  if (type === 'income') {
    document.querySelector('.type-selector .income').classList.add('active');
    if (paymentMethodGroup) paymentMethodGroup.style.display = 'none';
    if (paymentMethod) paymentMethod.value = 'cash';
  } else {
    document.querySelector('.type-selector .expense').classList.add('active');
    if (paymentMethodGroup) paymentMethodGroup.style.display = 'block';
  }

  // รีโหลดดรอปดาวน์หมวดหมู่
  populateCategoryDropdown();

  // ตรวจสอบซ่อน/แสดงกลุ่มบัตรเครดิต
  toggleCreditCardGroup();
}

// ฟังก์ชันเปิด/ปิดกล่องเลือกบัตรเครดิต
function toggleCreditCardGroup() {
  const paymentMethod = document.getElementById('paymentMethod').value;
  const creditCardGroup = document.getElementById('creditCardNameGroup');
  if (creditCardGroup) {
    if (paymentMethod === 'credit') {
      creditCardGroup.style.display = 'block';
    } else {
      creditCardGroup.style.display = 'none';
    }
  }
}

// ฟังก์ชันเปิด/ปิดกล่องระบุชื่อสถานีชาร์จเอง
function toggleCustomStationInput() {
  const selectVal = document.getElementById('evStationNameSelect').value;
  const customInput = document.getElementById('evStationNameCustom');
  if (customInput) {
    if (selectVal === 'อื่นๆ') {
      customInput.style.display = 'block';
    } else {
      customInput.style.display = 'none';
    }
  }
}

// เช็คว่าหมวดหมู่ที่เลือกใช่ ชาร์จรถ EV ไหม เพื่อเปิดฟอร์มรายละเอียดชาร์จ
// เช็คว่าหมวดหมู่ที่เลือกใช่ ชาร์จรถ EV ไหม เพื่อเปิดฟอร์มรายละเอียดชาร์จ
function checkCategoryType(selectElement) {
  if (!selectElement || selectElement.selectedIndex === -1 || !selectElement.options[selectElement.selectedIndex]) {
    return;
  }
  const selectedText = selectElement.options[selectElement.selectedIndex].text;
  checkSelectedCategoryName(selectedText);
}

// ตรวจสอบชื่อหมวดหมู่ที่เลือกเพื่อแสดงฟิลด์เสริมต่างๆ เช่น บันทึกรถ EV, มื้ออาหาร, ผู้รับเงิน
function checkSelectedCategoryName(selectedText) {
  const evSection = document.getElementById('evDetailsSection');
  const mealGroup = document.getElementById('mealTypeGroup');
  const recipientGroup = document.getElementById('recipientGroup');

  if (!selectedText) {
    if (evSection) evSection.classList.remove('show');
    if (mealGroup) mealGroup.style.display = 'none';
    if (recipientGroup) recipientGroup.style.display = 'none';
    return;
  }

  const lowerText = selectedText.toLowerCase();

  // ตรวจจับคีย์เวิร์ดเช่น 'EV' หรือ 'ชาร์จไฟ'
  if (lowerText.includes('ev') || lowerText.includes('ชาร์จไฟ') || lowerText.includes('ชาร์จรถ')) {
    if (evSection) {
      evSection.classList.add('show');
      updateEVDescription();
    }
  } else {
    if (evSection) evSection.classList.remove('show');
  }

  // ตรวจจับหมวดหมู่อาหาร
  if (mealGroup) {
    if (lowerText.includes('อาหาร') || lowerText.includes('เครื่องดื่ม') || lowerText.includes('food') || lowerText.includes('drink')) {
      mealGroup.style.display = 'block';
    } else {
      mealGroup.style.display = 'none';
    }
  }

  // ตรวจจับหมวดหมู่ให้ครอบครัว
  if (recipientGroup) {
    if (lowerText.includes('ให้ครอบครัว') || lowerText.includes('คนในบ้าน') || lowerText.includes('family') || lowerText.includes('allowance')) {
      recipientGroup.style.display = 'block';
    } else {
      recipientGroup.style.display = 'none';
    }
  }
}

// ฟังก์ชันจัดการเมื่อผู้ใช้เลือกตัวกรองวันที่แบบระบุวัน
function handleDateFilterChange() {
  const dateVal = document.getElementById('filterDate').value;
  if (dateVal) {
    const d = new Date(dateVal);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    document.getElementById('filterMonth').value = m;
    document.getElementById('filterYear').value = y;
  }
  fetchTransactions();
  // อัปเดตชาร์ตวิเคราะห์ด้วยถ้าเปิดแท็บวิเคราะห์อยู่
  const activeTab = document.querySelector('.nav-tab.active');
  if (activeTab && activeTab.getAttribute('onclick') && activeTab.getAttribute('onclick').includes('analytics-tab')) {
    renderAnalyticsCharts();
  }
}

// ฟังก์ชันล้างตัวกรองวันที่เมื่อผู้ใช้เปลี่ยนตัวกรองแบบเลือกเดือน/ปี
function clearDateFilter() {
  const filterDate = document.getElementById('filterDate');
  if (filterDate) {
    filterDate.value = '';
  }
}

// โหลดรายการธุรกรรมเงิน และอัปเดต Dashboard
async function fetchTransactions(page = 1) {
  currentPage = page;
  const month = document.getElementById('filterMonth').value;
  const year = document.getElementById('filterYear').value;
  const userId = document.getElementById('filterUser').value;
  const filterPayment = document.getElementById('filterPayment').value;
  const filterDate = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';

  try {
    // แยกเงินกันรายบุคคล ไม่นำมารวมกัน (ถ้ายังไม่มีการเลือกในดรอปดาวน์ให้ใช้ของผู้ใช้ที่ล็อกอินอยู่)
    const targetUserId = userId || (currentUser ? currentUser.id : '');
    let url = `${basePath}/api/transactions?page=${currentPage}&limit=${transactionsLimit}`;
    
    if (filterDate) {
      url += `&date=${filterDate}`;
    } else {
      url += `&month=${month}&year=${year}`;
    }
    
    if (targetUserId) url += `&user_id=${targetUserId}`;

    if (filterPayment && filterPayment !== 'all') {
      if (filterPayment === 'cash') {
        url += `&credit_status=none`;
      } else if (filterPayment === 'credit_unpaid') {
        url += `&credit_status=unpaid`;
      } else if (filterPayment === 'credit_paid') {
        url += `&credit_status=paid`;
      }
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      currentTransactions = data.transactions;
      renderTransactions(data.transactions);
      
      // อัปเดตข้อมูล pagination จาก response
      if (data.pagination) {
        totalPages = data.pagination.totalPages || 1;
        renderPaginationControls();
      }

      // คำนวณสรุปผลยอดเงิน โดยใช้รายการทั้งหมด (สำหรับยอดรวมในหน้า Dashboard เราอาจต้องการดึงข้อมูลยอดรวมโดยไม่มี pagination หรือจะคำนวณจากรายการย่อย สำหรับ Dashboard บ้านแสนอุ่น เรามีสรุปรายเดือนที่แสดงยอดรวมตรงนี้)
      // เพื่อให้ยอดเงินคงเหลือ / รายรับ / รายจ่าย ไม่เพี้ยนตาม pagination เราต้องคำนวณจากยอดรวมใน DB หรือดึงแยก แต่เดิมระบบอ่านค่าจาก transactions รายการ LIMIT 1000 เลย สำหรับ Dashboard เราจะยึดคำนวณจากหน้านั้นหรือเรียก api ยอดรวม แต่อีกวิธีคือเพิ่มยอดรวมสรุปที่คำนวณได้ส่งมาจาก endpoint transactions เสมอ
      // ในที่นี้ เพื่อไม่ให้ยอดรวมพังเมื่อทำ pagination เราจะอัปเดต calculateDashboardSummary จาก API หรือ query ยอดรวม
      // มาดู transactions endpoints ดั้งเดิม: query summary, index, ev, credits.
      calculateDashboardSummary(data.transactions, data.summary);
      await fetchUnpaidCredits(); // โหลดข้อมูลบัตรเครดิตค้างชำระ
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// ฟังก์ชันสร้างปุ่มควบคุม Pagination
function renderPaginationControls() {
  const container = document.getElementById('paginationControls');
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const lang = localStorage.getItem('lang') || 'th';
  const prevText = lang === 'th' ? 'ก่อนหน้า' : 'Prev';
  const nextText = lang === 'th' ? 'ถัดไป' : 'Next';

  // ปุ่มย้อนกลับ (จัดสไตล์เป็นวงกลมมนน่ารัก ขนาดเท่ากันสวยงาม)
  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn-cute';
  prevBtn.style.width = '36px';
  prevBtn.style.height = '36px';
  prevBtn.style.padding = '0';
  prevBtn.style.display = 'flex';
  prevBtn.style.alignItems = 'center';
  prevBtn.style.justifyContent = 'center';
  prevBtn.style.fontSize = '0.9rem';
  prevBtn.style.borderRadius = '50%';
  prevBtn.style.margin = '0';
  prevBtn.style.boxShadow = '0 3px 0px #E59F9F';
  prevBtn.disabled = currentPage === 1;
  if (currentPage === 1) {
    prevBtn.style.opacity = '0.5';
    prevBtn.style.cursor = 'not-allowed';
    prevBtn.style.boxShadow = 'none';
  }
  prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
  prevBtn.onclick = () => fetchTransactions(currentPage - 1);
  container.appendChild(prevBtn);

  // ข้อมูลหน้าปัจจุบัน
  const pageInfo = document.createElement('span');
  pageInfo.style.fontFamily = 'var(--font-main)';
  pageInfo.style.fontSize = '0.9rem';
  pageInfo.style.fontWeight = '600';
  pageInfo.style.color = 'var(--text-color)';
  pageInfo.style.padding = '0 10px';
  pageInfo.textContent = lang === 'th' 
    ? `หน้า ${currentPage} / ${totalPages}` 
    : `Page ${currentPage} / ${totalPages}`;
  container.appendChild(pageInfo);

  // ปุ่มถัดไป (จัดสไตล์เป็นวงกลมมนน่ารัก ขนาดเท่ากันสวยงาม)
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-cute';
  nextBtn.style.width = '36px';
  nextBtn.style.height = '36px';
  nextBtn.style.padding = '0';
  nextBtn.style.display = 'flex';
  nextBtn.style.alignItems = 'center';
  nextBtn.style.justifyContent = 'center';
  nextBtn.style.fontSize = '0.9rem';
  nextBtn.style.borderRadius = '50%';
  nextBtn.style.margin = '0';
  nextBtn.style.boxShadow = '0 3px 0px #E59F9F';
  nextBtn.disabled = currentPage === totalPages;
  if (currentPage === totalPages) {
    nextBtn.style.opacity = '0.5';
    nextBtn.style.cursor = 'not-allowed';
    nextBtn.style.boxShadow = 'none';
  }
  nextBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
  nextBtn.onclick = () => fetchTransactions(currentPage + 1);
  container.appendChild(nextBtn);
}

// แสดงรายการข้อมูลเงินบนหน้าเว็บ
function renderTransactions(transactions) {
  const listContainer = document.getElementById('transactionsList');
  listContainer.innerHTML = '';

  const lang = localStorage.getItem('lang') || 'th';

  if (transactions.length === 0) {
    const noRecs = lang === 'th' ? 'เดือนนี้ยังไม่มีบันทึกเงินเลยจ้า' : 'No transactions recorded this month.';
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 30px;">
        <i class="fa-solid fa-cookie-bite" style="font-size: 2.5rem; margin-bottom: 10px; color: #EADBC8;"></i>
        <p>${noRecs}</p>
      </div>
    `;
    return;
  }

  transactions.forEach(t => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const isEV = t.station_name || t.charger_power || t.energy_delivered;
    const formattedDate = new Date(t.transaction_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
      day: 'numeric',
      month: 'short'
    });

    let badgeHTML = '';
    if (isEV) {
      badgeHTML += `<span class="ev-badge"><i class="fa-solid fa-charging-station"></i> ${t.station_name || 'EV'}</span>`;
    }
    if (t.payment_method === 'credit') {
      const cardSuffix = t.credit_card_name ? ` (${t.credit_card_name})` : '';
      if (t.credit_status === 'unpaid') {
        const unpaidText = lang === 'th' ? 'ค้างจ่าย' : 'Unpaid';
        badgeHTML += `<span class="ev-badge" style="background-color: #FFF2E2; color: #E29734; border-color: #E29734;"><i class="fa-solid fa-credit-card"></i> ${unpaidText}${cardSuffix} 💳</span>`;
      } else if (t.credit_status === 'paid') {
        const paidText = lang === 'th' ? 'จ่ายแล้ว' : 'Paid';
        badgeHTML += `<span class="ev-badge" style="background-color: var(--income-bg); color: var(--income-color); border-color: var(--income-color);"><i class="fa-solid fa-circle-check"></i> ${paidText}${cardSuffix} ✅</span>`;
      }
    }
    if (t.meal_type) {
      const mealKeys = { 'เช้า': 'meal_breakfast', 'กลางวัน': 'meal_lunch', 'เย็น': 'meal_dinner', 'ดึก': 'meal_night' };
      const mealKey = mealKeys[t.meal_type];
      const translatedMeal = mealKey ? translations[lang][mealKey] : t.meal_type;
      const mealLabel = lang === 'th' ? 'มื้อ' : 'Meal: ';
      const mealIcons = { 'เช้า': '🌅', 'กลางวัน': '☀️', 'เย็น': '🌇', 'ดึก': '🌙' };
      const icon = mealIcons[t.meal_type] || '🍴';
      badgeHTML += `<span class="ev-badge" style="background-color: #E8F5E9; color: #2E7D32; border-color: #2E7D32;"><i class="fa-solid fa-utensils"></i> ${mealLabel}${translatedMeal} ${icon}</span>`;
    }
    if (t.recipient) {
      const recipientKeys = { 'ย่า': 'rec_grandma', 'แม่': 'rec_mom', 'ลูก': 'rec_kid', 'ญาติ': 'rec_relatives' };
      const recKey = recipientKeys[t.recipient];
      const translatedRec = recKey ? translations[lang][recKey] : t.recipient;
      const giveLabel = lang === 'th' ? 'ให้' : 'Give to ';
      const recipientIcons = { 'ย่า': '👵', 'แม่': '👩', 'ลูก': '👦', 'ญาติ': '👥' };
      const icon = recipientIcons[t.recipient] || '👤';
      badgeHTML += `<span class="ev-badge" style="background-color: #F3E5F5; color: #7B1FA2; border-color: #7B1FA2;"><i class="fa-solid fa-heart"></i> ${giveLabel}${translatedRec} ${icon}</span>`;
    }

    const editTitle = lang === 'th' ? 'แก้ไขรายการนี้' : 'Edit';
    const deleteTitle = lang === 'th' ? 'ลบรายการนี้' : 'Delete';
    const noDesc = lang === 'th' ? 'ไม่มีคำอธิบาย' : 'No description';
    const displayUser = getUserDisplayName({ username: t.avatar, displayName: t.display_name, display_name: t.display_name });

    item.innerHTML = `
      <div class="item-left">
        <div class="item-icon" style="background-color: ${t.category_color || '#888'}">
          <i class="fa-solid ${t.category_icon || 'fa-question'}"></i>
        </div>
        <div class="item-details">
          <h4>
            ${getCategoryName(t.category_name)}
            ${badgeHTML}
          </h4>
          <p>${formattedDate} • ${t.description || noDesc}</p>
          <div class="item-badge-user">
            <span>${t.avatar && (t.avatar.startsWith('http://') || t.avatar.startsWith('https://')) ? `<img src="${t.avatar}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 4px;" alt="avatar">` : (avatarMap[t.avatar] || '👤')}</span>
            <span>${displayUser}</span>
          </div>
        </div>
      </div>
      <div class="item-right">
        <span class="item-amount ${t.type}">
          ${t.type === 'income' ? '+' : '-'}${parseFloat(t.amount).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })} ${lang === 'th' ? '฿' : 'THB'}
        </span>
        <button class="btn-delete" onclick="startEditTransaction(${t.id})" title="${editTitle}" style="color: var(--ev-color); margin-right: 5px;">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn-delete" onclick="deleteTransaction(${t.id})" title="${deleteTitle}">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

// คำนวณสรุปยอดเงินและอัปเดตการ์ด Dashboard
function calculateDashboardSummary(transactions, summary) {
  let incomeTotal = 0;
  let expenseTotal = 0;
  let balance = 0;

  const lang = localStorage.getItem('lang') || 'th';
  const currency = lang === 'th' ? ' ฿' : ' THB';
  const locale = lang === 'th' ? 'th-TH' : 'en-US';

  if (summary) {
    // ใช้ยอดเงินทั้งหมดที่ส่งมาจาก Server โดยตรง (ไม่เพี้ยนตามการจัดหน้า pagination)
    balance = summary.overallBalance;
    incomeTotal = summary.filteredIncome;
    expenseTotal = summary.filteredExpense;
  } else {
    // Fallback ในกรณีไม่มีค่าสรุปจาก server
    transactions.forEach(t => {
      const amt = parseFloat(t.amount);
      if (t.type === 'income') {
        incomeTotal += amt;
      } else {
        if (t.payment_method !== 'credit') {
          expenseTotal += amt;
        }
      }
    });
    balance = incomeTotal - expenseTotal;
  }

  // อัปเดตยอดเงินคงเหลือ
  const balEl = document.getElementById('totalBalance');
  balEl.textContent = `${balance.toLocaleString(locale, { minimumFractionDigits: 2 })}${currency}`;
  if (balance >= 0) {
    balEl.style.color = 'var(--income-color)';
  } else {
    balEl.style.color = 'var(--expense-color)';
  }

  document.getElementById('totalIncome').textContent = `${incomeTotal.toLocaleString(locale, { minimumFractionDigits: 2 })}${currency}`;
  document.getElementById('totalExpense').textContent = `${expenseTotal.toLocaleString(locale, { minimumFractionDigits: 2 })}${currency}`;
}

// บันทึกธุรกรรมการเงิน (รองรับการเพิ่มใหม่และการแก้ไข)
async function saveTransaction(event) {
  event.preventDefault();

  const amount = document.getElementById('amount').value;
  const category_id = document.getElementById('categoryId').value;
  const transaction_date = document.getElementById('transactionDate').value;
  const description = document.getElementById('description').value;

  const evSection = document.getElementById('evDetailsSection');
  const isEVSelected = evSection.classList.contains('show');

  const payload = {
    amount,
    type: activeTransactionType,
    category_id,
    transaction_date,
    description,
    is_ev_charging: isEVSelected,
    ev_details: null,
    payment_method: document.getElementById('paymentMethod').value,
    credit_card_name: document.getElementById('creditCardName').value,
    meal_type: document.getElementById('mealTypeGroup').style.display === 'block' ? document.getElementById('mealType').value : null,
    recipient: document.getElementById('recipientGroup').style.display === 'block' ? document.getElementById('recipient').value : null
  };

  if (isEVSelected) {
    payload.ev_details = {
      station_name: document.getElementById('evStationNameSelect').value === 'อื่นๆ' 
        ? document.getElementById('evStationNameCustom').value 
        : document.getElementById('evStationNameSelect').value,
      station_branch: document.getElementById('evStationBranch').value,
      station_cabinet: document.getElementById('evStationCabinet').value,
      charger_power: document.getElementById('evChargerPower').value,
      energy_delivered: document.getElementById('evEnergyDelivered').value,
      odometer: document.getElementById('evOdometer').value,
      start_battery: document.getElementById('evStartBattery').value,
      end_battery: document.getElementById('evEndBattery').value
    };
  }

  try {
    const url = editTransactionId ? `${basePath}/api/transactions/${editTransactionId}` : basePath + '/api/transactions';
    const method = editTransactionId ? 'PUT' : 'POST';

    // ถ้าอยู่ในโหมดแก้ไข ให้รักษาค่า credit_status เดิมไว้ด้วย
    if (editTransactionId) {
      payload.payment_method = document.getElementById('paymentMethod').value;
      payload.credit_status = (payload.payment_method === 'credit') ? (editCreditStatus === 'none' ? 'unpaid' : editCreditStatus) : 'none';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      // สวิตช์ฟิลเตอร์ (เดือน/ปี/ผู้ใช้) ให้ตรงกับรายการที่เพิ่งบันทึก เพื่อให้ผู้ใช้งานมองเห็นรายการทันที
      const dateParts = transaction_date.split('-');
      if (dateParts.length === 3) {
        const transYear = parseInt(dateParts[0]);
        const transMonth = parseInt(dateParts[1]);
        
        document.getElementById('filterMonth').value = transMonth;
        
        const filterYearSelect = document.getElementById('filterYear');
        let yearExists = false;
        for (let i = 0; i < filterYearSelect.options.length; i++) {
          if (parseInt(filterYearSelect.options[i].value) === transYear) {
            yearExists = true;
            break;
          }
        }
        if (yearExists) {
          filterYearSelect.value = transYear;
        }
      }
      
      if (currentUser) {
        document.getElementById('filterUser').value = currentUser.id;
      }

      // รีเซ็ตล้างหน้าฟอร์มและโหมดแก้ไข
      cancelEditMode();
      
      // อัปเดตตารางและยอดเงินเงียบๆ โดยไม่มี popup กวนใจ
      await fetchTransactions();
    } else {
      const lang = localStorage.getItem('lang') || 'th';
      alert(data.message || translations[lang].alert_save_failed);
    }
  } catch (error) {
    console.error(error);
    const lang = localStorage.getItem('lang') || 'th';
    alert(translations[lang].alert_conn_error);
  }
}

// ลบธุรกรรมการเงิน (เปิด Modal ยืนยัน)
function deleteTransaction(id) {
  const modal = document.getElementById('confirmDeleteModal');
  const idInput = document.getElementById('deleteTransactionId');
  if (modal && idInput) {
    idInput.value = id;
    modal.style.display = 'flex';
    // โฟกัสไปที่ปุ่มลบ เพื่อให้กด Enter ได้ทันที
    setTimeout(() => {
      document.getElementById('btnConfirmDeleteTransaction')?.focus();
    }, 50);
  }
}

// ปิด Modal ยืนยันการลบ
function closeConfirmDeleteModal() {
  const modal = document.getElementById('confirmDeleteModal');
  if (modal) modal.style.display = 'none';
}

// ทำการลบจริงเมื่อกดยืนยันใน Modal
async function executeDeleteTransaction() {
  const idInput = document.getElementById('deleteTransactionId');
  if (!idInput) return;
  const id = idInput.value;
  const lang = localStorage.getItem('lang') || 'th';

  try {
    const res = await fetch(`${basePath}/api/transactions/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      await fetchTransactions();
      await fetchEVStatistics();
    } else {
      alert(data.message || translations[lang].alert_delete_failed);
    }
  } catch (error) {
    console.error(error);
    alert(translations[lang].alert_conn_failed);
  } finally {
    closeConfirmDeleteModal();
  }
}

// สลับแท็บหน้าจอหลัก
async function switchTab(tabId) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(t => t.classList.remove('active'));

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => b.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  // ตั้งค่าปุ่มกดแท็บที่แอคทีฟ
  if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) {
    event.currentTarget.classList.add('active');
  } else {
    // หาปุ่มที่มีฟังก์ชันเรียกใช้แท็บนี้
    const targetBtn = Array.from(tabBtns).find(b => b.getAttribute('onclick')?.includes(`'${tabId}'`));
    if (targetBtn) targetBtn.classList.add('active');
  }

  // ถ้าเปลี่ยนเป็นแท็บวิเคราะห์
  if (tabId === 'analytics-tab') {
    await renderAnalyticsCharts();
  }
  // ถ้าเปลี่ยนเป็นแท็บชาร์จรถไฟฟ้า
  else if (tabId === 'ev-tab') {
    await fetchEVStatistics();
  }
  // ถ้าเปลี่ยนเป็นแท็บบัตรเครดิต
  else if (tabId === 'credit-tab') {
    await fetchUnpaidCredits();
  }
  // ถ้าเปลี่ยนเป็นแท็บวางแผนงบประมาณเดือนหน้า
  else if (tabId === 'budget-tab') {
    initBudgetPlanner();
  }
}

// สร้างกราฟวิเคราะห์ (Analytics Charts)
async function renderAnalyticsCharts() {
  const month = document.getElementById('filterMonth').value;
  const year = document.getElementById('filterYear').value;
  const userId = document.getElementById('filterUser').value;
  const filterDate = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';

  // อ่านสีธีมปัจจุบันจาก CSS Variables
  const bodyStyle = getComputedStyle(document.body);
  const textColor = bodyStyle.getPropertyValue('--text-color').trim() || '#4A3E3D';
  const textMuted = bodyStyle.getPropertyValue('--text-muted').trim() || '#8E7C77';
  const cardBg = bodyStyle.getPropertyValue('--card-bg').trim() || '#FFFFFF';
  const borderColor = bodyStyle.getPropertyValue('--border-color').trim() || '#F3ECE3';

  try {
    let url = `${basePath}/api/transactions?`;
    if (filterDate) {
      url += `date=${filterDate}`;
    } else {
      url += `month=${month}&year=${year}`;
    }
    if (userId) url += `&user_id=${userId}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      const txs = data.transactions;

      // 1. แยกรายจ่ายรายหมวดหมู่
      const expenseMap = {};
      const expenseColors = {};
      let totalIncome = 0;
      let totalExpense = 0;

      txs.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'income') {
          totalIncome += amt;
        } else {
          totalExpense += amt;
          if (expenseMap[t.category_name]) {
            expenseMap[t.category_name] += amt;
          } else {
            expenseMap[t.category_name] = amt;
            expenseColors[t.category_name] = t.category_color || '#888888';
          }
        }
      });

      // กราฟสัดส่วนรายจ่าย (Pie Chart)
      const pieCtx = document.getElementById('categoryChart').getContext('2d');
      if (categoryChartInstance) categoryChartInstance.destroy();

      const lang = localStorage.getItem('lang') || 'th';
      const labels = Object.keys(expenseMap).map(name => getCategoryName(name));
      const values = Object.values(expenseMap);
      const colors = Object.values(expenseColors);

      if (labels.length === 0) {
        // หากไม่มีข้อมูล ให้วาดกราฟเปล่า
        categoryChartInstance = new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: [lang === 'th' ? 'ไม่มีข้อมูลรายจ่าย' : 'No expense data'],
            datasets: [{
              data: [1],
              backgroundColor: [borderColor]
            }]
          },
          options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: textMuted, font: { family: 'Kanit' } }
              }
            }
          }
        });
      } else {
        categoryChartInstance = new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: cardBg
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: textColor, font: { family: 'Kanit' } }
              }
            }
          }
        });
      }

      // กราฟเปรียบเทียบ (Bar Chart)
      const barCtx = document.getElementById('comparisonChart').getContext('2d');
      if (comparisonChartInstance) comparisonChartInstance.destroy();

      comparisonChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: [
            lang === 'th' ? translations.th.chart_label_income : translations.en.chart_label_income,
            lang === 'th' ? translations.th.chart_label_expense : translations.en.chart_label_expense
          ],
          datasets: [{
            label: lang === 'th' ? translations.th.chart_dataset_label : translations.en.chart_dataset_label,
            data: [totalIncome, totalExpense],
            backgroundColor: ['#61C0BF', '#FF8B94'],
            borderRadius: 12,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: textColor, font: { family: 'Kanit' } },
              grid: { color: borderColor }
            },
            x: {
              ticks: { color: textColor, font: { family: 'Kanit' } },
              grid: { color: borderColor }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Error rendering charts:', error);
  }
}

// โหลดข้อมูลสถิติชาร์จ EV
async function fetchEVStatistics() {
  try {
    const res = await fetch(basePath + '/api/ev/stats');
    const data = await res.json();

    if (data.success) {
      const stats = data.stats;
      const logs = data.logs;
      currentEVLogs = logs;

      const lang = localStorage.getItem('lang') || 'th';
      const currency = lang === 'th' ? ' ฿' : ' THB';
      const noComp = lang === 'th' ? 'ไม่มีข้อมูลเปรียบเทียบ' : 'No comparative data';
      const minRecords = lang === 'th' ? 'สะสมขั้นต่ำ 2 ครั้ง' : 'Min. 2 records';

      // อัปเดตการ์ดสถิติ EV
      document.getElementById('evTotalCost').textContent = `${parseFloat(stats.totalCost).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}${currency}`;
      document.getElementById('evTotalKWh').textContent = `${parseFloat(stats.totalKWh).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')} kWh`;
      document.getElementById('evAvgCostPerKWh').textContent = `${stats.costPerKWh}${currency}`;
      document.getElementById('evCostPerKm').textContent = stats.totalDistance > 0 ? `${stats.costPerKm}${currency}` : noComp;
      document.getElementById('evAvgEfficiency').textContent = stats.totalDistance > 0 ? `${stats.kmPerKWh} km/kWh` : noComp;
      document.getElementById('evTotalDistance').textContent = stats.totalDistance > 0 ? `${stats.totalDistance.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')} km` : minRecords;

      // อัปเดตตารางประวัติ EV
      const tableBody = document.getElementById('evLogsTableBody');
      if (tableBody) tableBody.innerHTML = '';

      if (logs.length === 0) {
        const noEvLogs = lang === 'th' ? 'ไม่มีข้อมูลประวัติการชาร์จรถไฟฟ้าเลยจ้า' : 'No EV charging history logs.';
        if (tableBody) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">
                ${noEvLogs}
              </td>
            </tr>
          `;
        }
        return;
      }

      // จัดการการแสดงผลปุ่มดูทั้งหมด
      const toggleContainer = document.getElementById('evLogsToggleContainer');
      const toggleBtn = document.getElementById('btnToggleEVLogsLimit');
      if (toggleContainer) {
        if (logs.length > 10) {
          toggleContainer.style.display = 'block';
          if (toggleBtn) {
            const btnSpan = toggleBtn.querySelector('span');
            if (btnSpan) {
              btnSpan.textContent = showAllEVLogs
                ? (lang === 'th' ? 'แสดงน้อยลง' : 'Show less')
                : (lang === 'th' ? `ดูบันทึกทั้งหมด (${logs.length})` : `Show all records (${logs.length})`);
            }
          }
        } else {
          toggleContainer.style.display = 'none';
        }
      }

      // หั่นรายการตามสถานะปุ่ม
      const displayLogs = showAllEVLogs ? logs : logs.slice(0, 10);

      displayLogs.forEach((log, index) => {
        const tr = document.createElement('tr');
        const formattedDate = new Date(log.transaction_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

        // คำนวณช่วงการสิ้นเปลืองของรอบนี้เมื่อเทียบกับรอบก่อนหน้า (หากมี)
        let rowOdoInfo = log.odometer ? `${log.odometer.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')} km` : '-';
        
        let badgeHTML = '';
        if (log.payment_method === 'credit') {
          if (log.credit_status === 'unpaid') {
            const unpaidText = lang === 'th' ? 'ค้างจ่าย' : 'Unpaid';
            badgeHTML = `<br><span class="ev-badge" style="background-color: #FFF2E2; color: #E29734; border-color: #E29734; font-size: 0.7rem; padding: 1px 6px; margin: 2px 0 0 0; display: inline-flex;"><i class="fa-solid fa-credit-card"></i> ${unpaidText} 💳</span>`;
          } else if (log.credit_status === 'paid') {
            const paidText = lang === 'th' ? 'จ่ายแล้ว' : 'Paid';
            badgeHTML = `<br><span class="ev-badge" style="background-color: var(--income-bg); color: var(--income-color); border-color: var(--income-color); font-size: 0.7rem; padding: 1px 6px; margin: 2px 0 0 0; display: inline-flex;"><i class="fa-solid fa-circle-check"></i> ${paidText} ✅</span>`;
          }
        }
        
        let branchText = '';
        if (log.station_branch) {
          branchText = lang === 'th' ? ` สาขา ${log.station_branch}` : ` Branch ${log.station_branch}`;
        }
        let cabinetText = '';
        if (log.station_cabinet) {
          cabinetText = lang === 'th' ? ` ตู้ ${log.station_cabinet}` : ` Cabinet ${log.station_cabinet}`;
        }

        const editTitle = lang === 'th' ? 'แก้ไขรายการนี้' : 'Edit';
        const deleteTitle = lang === 'th' ? 'ลบรายการนี้' : 'Delete';
        const viewDetailsText = lang === 'th' ? 'ดูรายละเอียด' : 'View Details';

        const displayUser = getUserDisplayName({ username: log.avatar, displayName: log.display_name, display_name: log.display_name });

        const dateHeader = lang === 'th' ? 'วันที่ชาร์จ' : 'Date';
        const userHeader = lang === 'th' ? 'คนบันทึก' : 'Recorded By';
        const stationHeader = lang === 'th' ? 'สถานีชาร์จ' : 'Station';
        const chargerHeader = lang === 'th' ? 'หัวชาร์จ' : 'Charger';
        const energyHeader = lang === 'th' ? 'ปริมาณไฟ' : 'Energy';
        const batteryHeader = lang === 'th' ? 'แบตเตอรี่' : 'Battery';
        const odoHeader = lang === 'th' ? 'เลขไมล์' : 'Odometer';
        const costHeader = lang === 'th' ? 'ค่าชาร์จ' : 'Cost';
        const manageHeader = lang === 'th' ? 'จัดการ' : 'Action';

        tr.innerHTML = `
          <td data-label="${dateHeader}">${formattedDate}</td>
          <td data-label="${stationHeader}"><strong>${log.station_name || '-'}${branchText}${cabinetText}</strong></td>
          <td data-label="${chargerHeader}">${log.charger_power ? `${log.charger_power} kW` : '-'}</td>
          <td data-label="${energyHeader}">${log.energy_delivered ? `${parseFloat(log.energy_delivered).toFixed(1)} kWh` : '-'}</td>
          <td data-label="${batteryHeader}">
            ${log.start_battery !== null && log.end_battery !== null ? `${log.start_battery}% ➔ ${log.end_battery}%` : '-'}
          </td>
          <td data-label="${odoHeader}">${rowOdoInfo}</td>
          <td data-label="${costHeader}">
            <strong>${parseFloat(log.amount).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })}${currency}</strong>
            ${badgeHTML}
          </td>
          <td data-label="${manageHeader}">
            <div style="display: flex; gap: 12px; justify-content: center; align-items: center;">
              <button class="btn-action-edit" onclick="startEditTransaction(${log.transaction_id})" title="${editTitle}"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn-action-delete" onclick="deleteTransaction(${log.transaction_id})" title="${deleteTitle}"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </td>
          <td class="mobile-only-cell">
            <button class="btn-toggle-ev-details" onclick="toggleEVRowDetails(this)">
              <i class="fa-solid fa-chevron-down"></i> ${viewDetailsText}
            </button>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error fetching EV stats:', error);
  }
}

// ฟังก์ชันสลับการจำกัดจำนวนแถวตาราง EV
function toggleEVLogsLimit() {
  showAllEVLogs = !showAllEVLogs;
  fetchEVStatistics();
}

// เริ่มเข้าสู่โหมดแก้ไขรายการ
function startEditTransaction(id) {
  let t = currentTransactions.find(item => item.id === id);
  const evLog = currentEVLogs.find(item => item.transaction_id === id);

  if (t && evLog) {
    t = { ...t, ...evLog };
  } else if (!t) {
    if (evLog) {
      t = {
        id: evLog.transaction_id,
        amount: evLog.amount,
        type: 'expense',
        category_id: evLog.category_id,
        transaction_date: evLog.transaction_date,
        description: evLog.description,
        payment_method: evLog.payment_method,
        credit_status: evLog.credit_status,
        credit_card_name: evLog.credit_card_name,
        meal_type: evLog.meal_type,
        recipient: evLog.recipient,
        station_name: evLog.station_name,
        station_branch: evLog.station_branch,
        station_cabinet: evLog.station_cabinet,
        charger_power: evLog.charger_power,
        energy_delivered: evLog.energy_delivered,
        start_battery: evLog.start_battery,
        end_battery: evLog.end_battery,
        odometer: evLog.odometer
      };
    }
  }
  if (!t) return;

  editTransactionId = id;
  editCreditStatus = t.credit_status || 'none';

  // สลับแท็บเพื่อให้ผู้ใช้เห็นฟอร์มแก้ไขทันที
  if (window.innerWidth <= 600) {
    switchTab('form-tab');
  } else {
    switchTab('transactions-tab');
  }

  // เลื่อนจอไปที่ฟอร์มด้านบนอย่างนุ่มนวล
  document.getElementById('transactionForm').scrollIntoView({ behavior: 'smooth' });

  // โหลดค่าของรายการเข้าสู่ฟอร์ม
  setTransactionType(t.type);
  document.getElementById('amount').value = parseFloat(t.amount);
  
  // ตั้งค่าหมวดหมู่
  const category = categoriesList.find(c => c.id === t.category_id);
  if (category) {
    const searchInput = document.getElementById('categorySearchInput');
    if (searchInput) {
      const lang = localStorage.getItem('lang') || 'th';
      const parentText = category.parent_category ? getCategoryName(category.parent_category) : (lang === 'th' ? 'หมวดหมู่หลัก' : 'Main Category');
      searchInput.value = `${parentText} ➔ ${getCategoryName(category.name)}`;
    }
    const hiddenId = document.getElementById('categoryId');
    if (hiddenId) {
      hiddenId.value = t.category_id;
    }
    checkSelectedCategoryName(category.name);
  }
  
  // ตั้งค่าวิธีการชำระเงิน
  const paymentMethod = document.getElementById('paymentMethod');
  if (paymentMethod) {
    paymentMethod.value = t.payment_method || 'cash';
  }

  // ตั้งค่าประเภทบัตรเครดิต
  const creditCardName = document.getElementById('creditCardName');
  if (creditCardName && t.payment_method === 'credit') {
    creditCardName.value = t.credit_card_name || 'Kbank';
  }
  toggleCreditCardGroup();

  // ตั้งค่าวันที่
  const dateObj = new Date(t.transaction_date);
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  document.getElementById('transactionDate').value = `${yyyy}-${mm}-${dd}`;
  
  document.getElementById('description').value = t.description || '';

  // ตั้งค่ามื้ออาหาร (ถ้ามี)
  const mealTypeSelect = document.getElementById('mealType');
  if (mealTypeSelect && t.meal_type) {
    mealTypeSelect.value = t.meal_type;
  }

  // ตั้งค่าผู้ได้รับเงิน (ถ้ามี)
  const recipientSelect = document.getElementById('recipient');
  if (recipientSelect && t.recipient) {
    recipientSelect.value = t.recipient;
  }

  // ตั้งค่ารายละเอียดการชาร์จ EV
  const stationSelect = document.getElementById('evStationNameSelect');
  const stationCustom = document.getElementById('evStationNameCustom');
  const stationBranch = document.getElementById('evStationBranch');
  if (stationBranch) {
    stationBranch.value = t.station_branch || '';
  }
  const stationCabinet = document.getElementById('evStationCabinet');
  if (stationCabinet) {
    stationCabinet.value = t.station_cabinet || '';
  }
  if (stationSelect && stationCustom) {
    const knownStations = ['PTT', 'EleX', 'PEA', 'SPARK'];
    if (t.station_name && knownStations.includes(t.station_name)) {
      stationSelect.value = t.station_name;
      stationCustom.value = '';
      stationCustom.style.display = 'none';
    } else if (t.station_name) {
      stationSelect.value = 'อื่นๆ';
      stationCustom.value = t.station_name;
      stationCustom.style.display = 'block';
    } else {
      stationSelect.selectedIndex = 0;
      stationCustom.value = '';
      stationCustom.style.display = 'none';
    }
  }
  document.getElementById('evChargerPower').value = t.charger_power ?? '';
  document.getElementById('evEnergyDelivered').value = t.energy_delivered ?? '';
  document.getElementById('evOdometer').value = t.odometer ?? '';
  document.getElementById('evStartBattery').value = t.start_battery ?? '';
  document.getElementById('evEndBattery').value = t.end_battery ?? '';

  // ปรับ UI ให้เป็นโหมดแก้ไข
  const formTitle = document.querySelector('#transactionFormCard .card-title');
  const lang = localStorage.getItem('lang') || 'th';
  if (formTitle) {
    formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> ${translations[lang].form_title_edit}`;
  }
  
  const submitBtn = document.querySelector('#transactionForm button[type="submit"]');
  submitBtn.innerHTML = translations[lang].btn_save_edit;
  submitBtn.style.backgroundColor = 'var(--ev-color)';
  submitBtn.style.boxShadow = '0 4px 0px #5F8F9F';

  // สร้างปุ่มยกเลิกการแก้ไข
  if (!document.getElementById('cancelEditBtn')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancelEditBtn';
    cancelBtn.className = 'btn-cute';
    cancelBtn.style.backgroundColor = '#C4B9AA';
    cancelBtn.style.boxShadow = '0 4px 0px #A4998A';
    cancelBtn.style.marginTop = '10px';
    cancelBtn.innerHTML = translations[lang].btn_cancel_edit;
    cancelBtn.onclick = cancelEditMode;
    document.getElementById('transactionForm').appendChild(cancelBtn);
  }
}

// ยกเลิกโหมดแก้ไข รีเซ็ตฟอร์มกลับเป็นโหมดบันทึกปกติ
function cancelEditMode() {
  editTransactionId = null;
  editCreditStatus = 'none';

  const formTitle = document.querySelector('#transactionFormCard .card-title');
  const lang = localStorage.getItem('lang') || 'th';
  if (formTitle) {
    formTitle.innerHTML = `<i class="fa-solid fa-heart-circle-plus"></i> ${translations[lang].form_title_new}`;
  }
  
  const submitBtn = document.querySelector('#transactionForm button[type="submit"]');
  submitBtn.innerHTML = translations[lang].btn_save_new;
  submitBtn.style.backgroundColor = 'var(--primary-color)';
  submitBtn.style.boxShadow = '0 4px 0px #E59F9F';

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.remove();

  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  const stationSelect = document.getElementById('evStationNameSelect');
  if (stationSelect) stationSelect.selectedIndex = 0;
  const stationCustom = document.getElementById('evStationNameCustom');
  if (stationCustom) {
    stationCustom.value = '';
    stationCustom.style.display = 'none';
  }
  const stationBranch = document.getElementById('evStationBranch');
  if (stationBranch) {
    stationBranch.value = '';
  }
  const stationCabinet = document.getElementById('evStationCabinet');
  if (stationCabinet) {
    stationCabinet.value = '';
  }
  document.getElementById('evChargerPower').value = '';
  document.getElementById('evEnergyDelivered').value = '';
  document.getElementById('evOdometer').value = '';
  document.getElementById('evStartBattery').value = '';
  document.getElementById('evEndBattery').value = '';

  const paymentMethod = document.getElementById('paymentMethod');
  if (paymentMethod) paymentMethod.value = 'cash';
  const paymentMethodGroup = document.getElementById('paymentMethodGroup');
  if (paymentMethodGroup) paymentMethodGroup.style.display = 'block';

  // รีเซ็ตค่าเลือกบัตรเครดิต
  const creditCardName = document.getElementById('creditCardName');
  if (creditCardName) creditCardName.selectedIndex = 0;
  toggleCreditCardGroup();

  // รีเซ็ตค่ามื้ออาหาร
  const mealType = document.getElementById('mealType');
  if (mealType) mealType.selectedIndex = 0;
  const mealTypeGroup = document.getElementById('mealTypeGroup');
  if (mealTypeGroup) mealTypeGroup.style.display = 'none';

  // รีเซ็ตค่าผู้ได้รับเงิน
  const recipient = document.getElementById('recipient');
  if (recipient) recipient.selectedIndex = 0;
  const recipientGroup = document.getElementById('recipientGroup');
  if (recipientGroup) recipientGroup.style.display = 'none';
  
  setTodayDate();
  populateCategoryDropdown();
}

// ฟังก์ชันดึงรายการเครดิตค้างชำระ
async function fetchUnpaidCredits() {
  const userId = document.getElementById('filterUser').value;
  const targetUserId = userId || (currentUser ? currentUser.id : '');
  
  if (!targetUserId) return;
  
  try {
    const res = await fetch(`${basePath}/api/transactions?credit_status=unpaid&user_id=${targetUserId}`);
    const data = await res.json();
    if (data.success) {
      unpaidTransactionsList = data.transactions;
      renderUnpaidCredits();
    }
  } catch (error) {
    console.error('Error fetching unpaid credits:', error);
  }
}

// แสดงรายการเครดิตค้างชำระใน Widget (รองรับการฟิลเตอร์แยกตามบัตร)
function renderUnpaidCredits() {
  const listContainer = document.getElementById('unpaidCreditList');
  const actionArea = document.getElementById('creditActionArea');
  
  listContainer.innerHTML = '';
  
  const lang = localStorage.getItem('lang') || 'th';
  const currency = lang === 'th' ? ' ฿' : ' THB';

  // กรองรายการตามบัตรเครดิตที่เลือก
  const filtered = activeCreditCardFilter === 'all'
    ? unpaidTransactionsList
    : unpaidTransactionsList.filter(t => t.credit_card_name === activeCreditCardFilter);
  
  // คำนวณยอดหนี้ค้างชำระรวมทั้งหมดของคนนี้ (ไม่สนใจฟิลเตอร์เพื่อแสดงหนี้สินรวมจริงในภาพรวม)
  let totalUnpaid = 0;
  unpaidTransactionsList.forEach(t => {
    totalUnpaid += parseFloat(t.amount);
  });
  
  document.getElementById('totalUnpaidCredit').textContent = `${totalUnpaid.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })}${currency}`;
  const creditOutstandingEl = document.getElementById('totalCreditOutstanding');
  if (creditOutstandingEl) {
    creditOutstandingEl.textContent = `${totalUnpaid.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })}${currency}`;
  }

  if (filtered.length === 0) {
    const emptyMsg = activeCreditCardFilter === 'all' 
      ? (lang === 'th' ? translations.th.credit_empty_msg : translations.en.credit_empty_msg) 
      : (lang === 'th' ? translations.th.credit_empty_filter_msg : translations.en.credit_empty_filter_msg);
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 25px; font-size: 0.85rem;">
        <i class="fa-solid fa-face-smile" style="font-size: 1.5rem; margin-bottom: 5px; color: var(--income-color);"></i>
        <p>${emptyMsg}</p>
      </div>
    `;
    actionArea.style.display = 'none';
    const selectAllRow = document.getElementById('creditSelectAllRow');
    if (selectAllRow) selectAllRow.style.display = 'none';
    return;
  }
  
  const selectAllRow = document.getElementById('creditSelectAllRow');
  if (selectAllRow) {
    selectAllRow.style.display = 'flex';
  }
  const selectAllCheckbox = document.getElementById('selectAllCreditCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  
  filtered.forEach(t => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.padding = '8px 12px';
    div.style.border = '2px solid var(--border-color)';
    div.style.borderRadius = '12px';
    div.style.backgroundColor = 'var(--input-bg)';
    div.style.color = 'var(--text-color)';
    div.style.fontSize = '0.85rem';
    
    const formattedDate = new Date(t.transaction_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
      day: 'numeric',
      month: 'short'
    });
    
    const cardDisplay = t.credit_card_name ? ` (${t.credit_card_name})` : '';
    const noDesc = lang === 'th' ? 'ไม่มีคำอธิบาย' : 'No description';
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" class="credit-checkbox" value="${t.id}" data-amount="${t.amount}" style="width: 16px; height: 16px; cursor: pointer;" onchange="updateSelectedCreditAmount()">
        <div>
          <strong>${getCategoryName(t.category_name)}</strong><span style="color: var(--ev-color); font-weight: 500;">${cardDisplay}</span> - ${t.description || noDesc}<br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${formattedDate}</span>
        </div>
      </div>
      <strong style="color: var(--expense-color);">${parseFloat(t.amount).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })}${currency}</strong>
    `;
    listContainer.appendChild(div);
  });
  
  updateSelectedCreditAmount();
  actionArea.style.display = 'block';
}

// ฟังก์ชันกดฟิลเตอร์เปลี่ยนบัตรเครดิต
function setCreditCardFilter(cardName) {
  activeCreditCardFilter = cardName;
  
  // อัปเดตสไตล์ปุ่มที่กำลังเลือก
  const btns = document.querySelectorAll('.credit-filter-btn');
  btns.forEach(btn => {
    btn.classList.remove('active');
    const onclickAttr = btn.getAttribute('onclick');
    if (onclickAttr && onclickAttr.includes(`'${cardName}'`)) {
      btn.classList.add('active');
    }
  });
  
  renderUnpaidCredits();
}

// อัปเดตยอดรวมชำระที่เลือกติ๊กกล่อง
function updateSelectedCreditAmount() {
  const allCheckboxes = document.querySelectorAll('.credit-checkbox');
  const checkedCheckboxes = document.querySelectorAll('.credit-checkbox:checked');
  let selectedSum = 0;
  checkedCheckboxes.forEach(cb => {
    selectedSum += parseFloat(cb.getAttribute('data-amount') || 0);
  });
  const lang = localStorage.getItem('lang') || 'th';
  const currency = lang === 'th' ? ' ฿' : ' THB';
  document.getElementById('selectedCreditAmount').textContent = `${selectedSum.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2 })}${currency}`;

  const selectAllCheckbox = document.getElementById('selectAllCreditCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length;
  }
}

// เลือกทั้งหมด / ยกเลิกการเลือกทั้งหมด
function toggleSelectAllCredit(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.credit-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
  updateSelectedCreditAmount();
}

// ชำระยอดหนี้ที่เลือก (ส่งไปยัง API หักยอดเงินสดจริงในบัญชี)
async function payCreditTransactions() {
  const checkboxes = document.querySelectorAll('.credit-checkbox:checked');
  const lang = localStorage.getItem('lang') || 'th';
  if (checkboxes.length === 0) {
    alert(translations[lang].alert_no_credit_selected);
    return;
  }
  
  const transactionIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const paymentDate = document.getElementById('creditPayDate').value;
  
  if (!paymentDate) {
    alert(translations[lang].alert_no_pay_date);
    return;
  }
  
  try {
    const res = await fetch(basePath + '/api/transactions/pay-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_ids: transactionIds,
        payment_date: paymentDate
      })
    });
    
    const data = await res.json();
    if (data.success) {
      await fetchTransactions(); // อัปเดตข้อมูลแดชบอร์ด
    } else {
      alert(data.message || translations[lang].alert_pay_credit_failed);
    }
  } catch (error) {
    console.error(error);
    alert(translations[lang].alert_conn_error);
  }
}

// จัดการการ Logout (เปิด Modal)
function handleLogout() {
  const lang = localStorage.getItem('lang') || 'th';
  const modal = document.getElementById('confirmLogoutModal');
  
  // แปลภาษาให้กับเนื้อหาใน Modal
  const titleSpan = modal?.querySelector('.modal-title span');
  const descP = modal?.querySelector('p');
  const cancelBtn = modal?.querySelector('button[onclick="closeConfirmLogoutModal()"]');
  const confirmBtn = modal?.querySelector('button[onclick="executeLogout()"]');

  if (titleSpan) titleSpan.textContent = translations[lang].logout_modal_title || 'ออกจากระบบ?';
  if (descP) descP.textContent = translations[lang].logout_modal_desc || 'คุณต้องการออกจากระบบบันทึกการเงินครอบครัวใช่หรือไม่?';
  if (cancelBtn) cancelBtn.textContent = translations[lang].btn_cancel || 'ยกเลิก';
  if (confirmBtn) {
    // เก็บส่วน HTML ไอคอน 🚪 ไว้
    confirmBtn.innerHTML = (translations[lang].btn_confirm_logout || 'ยืนยัน') + ' 🚪';
  }

  if (modal) modal.style.display = 'flex';
}

// ปิด Modal ยืนยัน Logout
function closeConfirmLogoutModal() {
  const modal = document.getElementById('confirmLogoutModal');
  if (modal) modal.style.display = 'none';
}

// ทำการ Logout จริงเมื่อกดยืนยันใน Modal
async function executeLogout() {
  const lang = localStorage.getItem('lang') || 'th';
  try {
    const res = await fetch(basePath + '/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      window.location.href = basePath + '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    alert(translations[lang].alert_logout_failed);
  } finally {
    closeConfirmLogoutModal();
  }
}

// ฟังก์ชันอัปเดตคำอธิบายรายการชาร์จรถ EV อัตโนมัติจากชื่อสถานีและสาขา
function updateEVDescription() {
  const categoryIdVal = document.getElementById('categoryId')?.value;
  if (!categoryIdVal) return;
  const category = categoriesList.find(c => String(c.id) === String(categoryIdVal));
  const selectedText = category ? category.name : '';
  
  // ทำการอัปเดตเฉพาะเมื่อเป็นหมวดหมู่ EV เท่านั้น
  if (selectedText.toLowerCase().includes('ev') || selectedText.includes('ชาร์จไฟ') || selectedText.includes('ชาร์จรถ')) {
    const stationSelect = document.getElementById('evStationNameSelect').value;
    const stationName = stationSelect === 'อื่นๆ' ? document.getElementById('evStationNameCustom').value : stationSelect;
    const branch = document.getElementById('evStationBranch').value.trim();
    const cabinet = document.getElementById('evStationCabinet').value.trim();
    
    let genDesc = 'ชาร์จไฟ';
    if (stationName && stationName.trim()) {
      genDesc += ` ${stationName.trim()}`;
    }
    if (branch) {
      genDesc += ` สาขา ${branch}`;
    }
    if (cabinet) {
      genDesc += ` ตู้ ${cabinet}`;
    }
    
    document.getElementById('description').value = genDesc;
  }
}

// ย้ายส่วนการ์ดและรายการธุรกรรมตามขนาดหน้าจอ (มือถือ/เดสก์ท็อป)
function handleResponsiveLayout() {
  const isMobile = window.innerWidth <= 600;
  const formCard = document.getElementById('transactionFormCard');
  const listCard = document.getElementById('transactionListCard');
  const summaryGrid = document.getElementById('summaryGrid');
  const desktopContainer = document.getElementById('desktopTransactionsContainer');
  const formTab = document.getElementById('form-tab');
  const listTab = document.getElementById('list-tab');
  const summaryTab = document.getElementById('summary-tab');

  if (isMobile) {
    // หน้าจอมือถือ: ย้ายฟอร์มไป form-tab, รายการไป list-tab, และการ์ดสรุปยอดไป summary-tab
    if (summaryTab && summaryGrid && summaryGrid.parentNode !== summaryTab) {
      summaryTab.appendChild(summaryGrid);
    }
    if (formTab && formCard && formCard.parentNode !== formTab) {
      formTab.appendChild(formCard);
    }
    if (listTab && listCard && listCard.parentNode !== listTab) {
      listTab.appendChild(listCard);
    }

    // แก้ปัญหาหน้าจอดับเมื่อย่อขนาดหน้าจอ: ถ้าแท็บปัจจุบันเป็นแท็บเดสก์ท็อป ให้สลับไปที่แท็บฟอร์มมือถือ
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'transactions-tab') {
      switchTab('form-tab');
    }
  } else {
    // หน้าจอเดสก์ท็อป: ย้ายกลับมาอยู่ในตู้คอนเทนเนอร์หลัก
    const container = document.querySelector('.container');
    if (container && summaryGrid && summaryGrid.parentNode !== container) {
      container.insertBefore(summaryGrid, container.firstChild);
    }
    if (desktopContainer) {
      if (formCard && formCard.parentNode !== desktopContainer) {
        desktopContainer.appendChild(formCard);
      }
      if (listCard && listCard.parentNode !== desktopContainer) {
        desktopContainer.appendChild(listCard);
      }
    }

    // แก้ปัญหาหน้าจอดับเมื่อขยายขนาดหน้าจอ: ถ้าแท็บปัจจุบันเป็นแท็บมือถือ ให้สลับไปแท็บรวมเดสก์ท็อป
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && (activeTab.id === 'form-tab' || activeTab.id === 'list-tab' || activeTab.id === 'summary-tab')) {
      switchTab('transactions-tab');
    }
  }
}

// ==========================================
// Change Password Modal & API interaction
// ==========================================

// ฟังก์ชันเปิด Modal เปลี่ยนรหัสผ่าน
function openChangePasswordModal() {
  document.getElementById('changePasswordModal').style.display = 'flex';
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordError').style.display = 'none';
  document.getElementById('changePasswordSuccess').style.display = 'none';
}

// ฟังก์ชันปิด Modal เปลี่ยนรหัสผ่าน
function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').style.display = 'none';
}

// ฟังก์ชันส่งฟอร์มเปลี่ยนรหัสผ่าน
async function handleChangePassword(event) {
  event.preventDefault();
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;
  const errorDiv = document.getElementById('changePasswordError');
  const successDiv = document.getElementById('changePasswordSuccess');

  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  const lang = localStorage.getItem('lang') || 'th';
  if (newPassword !== confirmNewPassword) {
    errorDiv.textContent = lang === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกันจ้า กรุณากรอกใหม่อีกครั้ง' : 'New passwords do not match. Please try again.';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(basePath + '/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ oldPassword, newPassword })
    });

    const data = await res.json();
    if (data.success) {
      successDiv.textContent = data.message;
      successDiv.style.display = 'block';
      document.getElementById('changePasswordForm').reset();
      
      // ปิด modal อัตโนมัติหลังจากเปลี่ยนรหัสผ่านสำเร็จ 1.5 วินาที
      setTimeout(() => {
        closeChangePasswordModal();
      }, 1500);
    } else {
      errorDiv.textContent = data.message || (lang === 'th' ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ' : 'Password change failed.');
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Change password error:', error);
    errorDiv.textContent = lang === 'th' ? 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์' : 'Connection to server failed.';
    errorDiv.style.display = 'block';
  }
}

// Toggle user profile dropdown
function toggleProfileDropdown(event) {
  event.stopPropagation();
  const menu = document.getElementById('profileDropdownMenu');
  const trigger = document.getElementById('userProfileTrigger');
  if (menu && trigger) {
    menu.classList.toggle('show');
    trigger.classList.toggle('active');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
  const menu = document.getElementById('profileDropdownMenu');
  const trigger = document.getElementById('userProfileTrigger');
  if (menu && menu.classList.contains('show')) {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) {
      menu.classList.remove('show');
      trigger.classList.remove('active');
    }
  }
});

// Toggle EV log row details on mobile
function toggleEVRowDetails(button) {
  const tr = button.closest('tr');
  if (!tr) return;
  
  const isExpanded = tr.classList.toggle('expanded');
  const lang = localStorage.getItem('lang') || 'th';
  
  if (isExpanded) {
    button.innerHTML = `<i class="fa-solid fa-chevron-up"></i> ${translations[lang].ev_btn_hide}`;
  } else {
    button.innerHTML = `<i class="fa-solid fa-chevron-down"></i> ${translations[lang].ev_btn_show}`;
  }
}

// === Slip OCR Scanner Functions ===

// คลิกปุ่มเพื่อกระตุ้นให้ผู้ใช้อัปโหลดไฟล์รูปภาพสลิป
function triggerSlipUpload() {
  const inputEl = document.getElementById('slipUploadInput');
  if (inputEl) {
    inputEl.click();
  }
}

// ประมวลผลเมื่อเลือกสลิปสำเร็จ
function handleSlipUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const overlay = document.getElementById('ocrLoadingOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }

  // รัน Tesseract OCR บนรูปภาพที่อัปโหลด (รองรับทั้งภาษาไทยและอังกฤษ)
  Tesseract.recognize(
    file,
    'tha+eng',
    {
      logger: m => console.log('OCR progress:', m)
    }
  ).then(({ data: { text } }) => {
    console.log('OCR Raw Output:\n', text);
    parseSlipText(text);
  }).catch(err => {
    console.error('OCR Process Error:', err);
    const lang = localStorage.getItem('lang') || 'th';
    alert(lang === 'th' ? 'เกิดข้อผิดพลาดในการแสกนสลิป กรุณาลองใหม่อีกครั้งนะครับ' : 'Error scanning the slip. Please try again.');
  }).finally(() => {
    if (overlay) {
      overlay.style.display = 'none';
    }
    // รีเซ็ตค่า Input เพื่อให้สามารถอัปโหลดไฟล์เดิมซ้ำเพื่อทดสอบใหม่ได้
    event.target.value = '';
  });
}

// ฟังก์ชันวิเคราะห์และดึงข้อมูลสลิป
function parseSlipText(text) {
  // นำมารวมสระอำที่สะกดแยกแบบ Nikhahit (U+0E4D) + U+0E32 ให้กลายเป็น U+0E33 (ำ) เพื่อป้องกันจับคู่ภาษาไทยไม่ติด
  const normalizedText = text.replace(/\u0E4D\u0E32/g, '\u0E33');
  const cleanText = normalizedText.replace(/,/g, ''); // เอา comma ออกเพื่อไม่ให้กวนใจ Regex ตัวเลข
  const lang = localStorage.getItem('lang') || 'th';

  // 1. ดึงยอดเงิน (Amount)
  const amountRegexes = [
    /(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|โอนเงิน|ยอดชำระ|ค่าชาร์จ|amount|net|total)\D*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:บาท|thb|usd|฿)/i,
    /(?:โอน|จ่าย)\D*(\d+(?:\.\d{1,2})?)/i,
    /(\d+\.\d{2})/ // ดึงตัวเลขทศนิยม 2 ตำแหน่งตัวแรกสุด (ถ้าไม่เจอตามคีย์เวิร์ดด้านบน)
  ];
  
  let parsedAmount = null;
  for (const regex of amountRegexes) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      parsedAmount = parseFloat(match[1]);
      if (parsedAmount > 0) break;
    }
  }

  // 2. ดึงวันที่ทำรายการ (Date)
  let parsedDate = null;

  // ลองดึงจากเลขอ้างอิง (Ref No. / เลขที่อ้างอิง) ก่อน เนื่องจากปกติจะมีประทับตราวันเวลา ค.ศ. YYYYMMDD ไว้ในเลขยาวๆ เสมอ และแม่นยำที่สุด
  const refNoMatch = cleanText.match(/\b(202\d)(\d{2})(\d{2})\d{6,}\b/);
  if (refNoMatch) {
    const year = parseInt(refNoMatch[1]);
    const month = parseInt(refNoMatch[2]) - 1;
    const day = parseInt(refNoMatch[3]);
    parsedDate = new Date(year, month, day);
  }

  // หากไม่ได้จาก Ref No. ให้ดึงตามรูปแบบข้อความปกติ
  if (!parsedDate) {
    const thaiMonths = {
      'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
      'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11,
      'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3, 'พฤษภาคม': 4, 'มิถุนายน': 5,
      'กรกฎาคม': 6, 'สิงหาคม': 7, 'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11
    };
    
    const engMonths = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
    };

    // ลองดึงวันเดือนปีรูปแบบไทย เช่น 23 มิ.ย. 2569 หรือ 23 มิ.ย. 69
    const thaiDateMatch = cleanText.match(/(\d{1,2})\s*([ก-๙\.]+)\s*(\d{2,4})/);
    if (thaiDateMatch) {
      const day = parseInt(thaiDateMatch[1]);
      const monthStr = thaiDateMatch[2].replace(/\./g, '').trim();
      let year = parseInt(thaiDateMatch[3]);
      
      let monthIndex = -1;
      for (const key in thaiMonths) {
        if (key.replace(/\./g, '') === monthStr || monthStr.includes(key.replace(/\./g, ''))) {
          monthIndex = thaiMonths[key];
          break;
        }
      }
      
      if (monthIndex !== -1) {
        if (year > 2500) {
          year -= 543;
        } else if (year < 100) {
          year += (year >= 43 ? 1957 : 2000); // แปลงพ.ศ. ย่อ หรือ ค.ศ. ย่อ
        }
        parsedDate = new Date(year, monthIndex, day);
      }
    }

    // ลองดึงรูปแบบอังกฤษ เช่น 23 Jun 2026
    if (!parsedDate) {
      const engDateMatch = cleanText.match(/(\d{1,2})\s*([a-zA-Z]+)\s*(\d{4})/);
      if (engDateMatch) {
        const day = parseInt(engDateMatch[1]);
        const monthStr = engDateMatch[2].toLowerCase();
        const year = parseInt(engDateMatch[3]);
        
        let monthIndex = -1;
        for (const key in engMonths) {
          if (monthStr.startsWith(key)) {
            monthIndex = engMonths[key];
            break;
          }
        }
        if (monthIndex !== -1) {
          parsedDate = new Date(year, monthIndex, day);
        }
      }
    }

    // ลองดึงรูปแบบตัวเลข เช่น 23/06/2026 หรือ 23-06-2569
    if (!parsedDate) {
      const slashDateMatch = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (slashDateMatch) {
        const day = parseInt(slashDateMatch[1]);
        const month = parseInt(slashDateMatch[2]) - 1;
        let year = parseInt(slashDateMatch[3]);
        if (year > 2500) year -= 543;
        else if (year < 100) year += 2000;
        parsedDate = new Date(year, month, day);
      }
    }
  }

  // 3. ดึงข้อมูลบันทึกช่วยจำจากผู้รับเงินโอน (Recipient)
  let memoText = '';
  // ค้นหาคำระบุผู้รับโอนแทนการค้นหาผู้โอน เพื่อหลีกเลี่ยงการหยิบชื่อเจ้าของสลิปมาแสดง และหลีกเลี่ยงการดึงเลขบัญชีผู้รับแทนชื่อ
  const toReceiverMatch = cleanText.match(/(?:ไปที่|ผู้รับโอน|ผู้รับเงิน|เข้าบัญชี|โอนไปยัง|to|receiver)\s*(?:\([^)]*\))?\s*([a-zA-Zก-๙\s\.\-]+)/i);
  if (toReceiverMatch && toReceiverMatch[1]) {
    memoText = toReceiverMatch[1].trim().split('\n')[0].trim().substring(0, 30);
  }

  // กรอกข้อมูลเข้าฟอร์ม
  if (parsedAmount) {
    document.getElementById('amount').value = parsedAmount;
  }
  if (parsedDate && !isNaN(parsedDate.getTime())) {
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    document.getElementById('transactionDate').value = `${yyyy}-${mm}-${dd}`;
  } else {
    // ถ้าแปลงวันที่ไม่ได้ ให้ใช้วันนี้เป็นค่าเริ่มต้น
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('transactionDate').value = `${yyyy}-${mm}-${dd}`;
  }

  if (memoText) {
    document.getElementById('description').value = (lang === 'th' ? 'โอนให้ ' : 'Transfer to ') + memoText;
    
    // เดาหมวดหมู่ตามบันทึก
    const lowerMemo = memoText.toLowerCase();
    let guessedCategoryName = '';

    if (lowerMemo.includes('ชาร์จ') || lowerMemo.includes('bolt') || lowerMemo.includes('ptt') || lowerMemo.includes('elex') || lowerMemo.includes('pea') || lowerMemo.includes('spark') || lowerMemo.includes('ev')) {
      guessedCategoryName = 'ชาร์จไฟรถ EV';
    } else if (lowerMemo.includes('น้ำมัน') || lowerMemo.includes('shell') || lowerMemo.includes('caltex') || lowerMemo.includes('esso') || lowerMemo.includes('bangchak')) {
      guessedCategoryName = 'น้ำมันรถ';
    } else if (lowerMemo.includes('กาแฟ') || lowerMemo.includes('amazon') || lowerMemo.includes('อเมซอน') || lowerMemo.includes('starbucks') || lowerMemo.includes('ชาไข่มุก') || lowerMemo.includes('เต่าบิน')) {
      guessedCategoryName = 'เครื่องดื่ม / กาแฟ';
    } else if (lowerMemo.includes('ขนม') || lowerMemo.includes('เค้ก') || lowerMemo.includes('ไอติม') || lowerMemo.includes('ไอศกรีม') || lowerMemo.includes('cafe') || lowerMemo.includes('คาเฟ่')) {
      guessedCategoryName = 'ของหวาน / ขนม / คาเฟ่';
    } else if (lowerMemo.includes('อาหาร') || lowerMemo.includes('กิน') || lowerMemo.includes('ข้าว') || lowerMemo.includes('kfc') || lowerMemo.includes('mk') || lowerMemo.includes('food') || lowerMemo.includes('7-eleven') || lowerMemo.includes('เซเว่น')) {
      guessedCategoryName = 'ค่าอาหารและเครื่องดื่ม';
    } else if (lowerMemo.includes('ไฟ') || lowerMemo.includes('ไฟฟ้า')) {
      guessedCategoryName = 'ค่าไฟฟ้า';
    } else if (lowerMemo.includes('น้ำ') || lowerMemo.includes('ประปา')) {
      guessedCategoryName = 'ค่าน้ำประปา';
    } else if (lowerMemo.includes('ทางด่วน') || lowerMemo.includes('easy pass') || lowerMemo.includes('easypass') || lowerMemo.includes('m-flow') || lowerMemo.includes('mflow') || lowerMemo.includes('ค่าจอด')) {
      guessedCategoryName = 'ค่าทางด่วน / ค่าจอดรถ';
    } else if (lowerMemo.includes('ล้างรถ') || lowerMemo.includes('เปลี่ยนยาง') || lowerMemo.includes('เช็กระยะ') || lowerMemo.includes('ซ่อมรถ')) {
      guessedCategoryName = 'บำรุงรักษารถ / ล้างรถ';
    } else if (lowerMemo.includes('netflix') || lowerMemo.includes('youtube') || lowerMemo.includes('spotify') || lowerMemo.includes('disney') || lowerMemo.includes('duolingo') || lowerMemo.includes('icloud') || lowerMemo.includes('googleone') || lowerMemo.includes('เซิฟเวอร์') || lowerMemo.includes('โดเมน') || lowerMemo.includes('server') || lowerMemo.includes('domain')) {
      guessedCategoryName = 'ค่าบริการรายเดือน (Subscriptions)';
    } else if (lowerMemo.includes('ทำบุญ') || lowerMemo.includes('บริจาค') || lowerMemo.includes('ของขวัญ') || lowerMemo.includes('ซอง')) {
      guessedCategoryName = 'ของขวัญ / ทำบุญ';
    }

    if (guessedCategoryName) {
      const category = categoriesList.find(c => c.name === guessedCategoryName);
      if (category) {
        const searchInput = document.getElementById('categorySearchInput');
        if (searchInput) {
          const parentText = category.parent_category ? getCategoryName(category.parent_category) : (lang === 'th' ? 'หมวดหมู่หลัก' : 'Main Category');
          searchInput.value = `${parentText} ➔ ${getCategoryName(category.name)}`;
        }
        const hiddenId = document.getElementById('categoryId');
        if (hiddenId) {
          hiddenId.value = category.id;
        }
        checkSelectedCategoryName(category.name);
      }
    }
  }

  // สรุปแจ้งเตือนให้ตรวจสอบ
  const formattedTransDate = document.getElementById('transactionDate').value;
  const alertMsg = lang === 'th'
    ? `อ่านข้อมูลสลิปสำเร็จ! 🎉\n\n- ยอดเงิน: ${parsedAmount ? parsedAmount.toFixed(2) : '-'} บาท\n- วันที่: ${formattedTransDate}\n- รายละเอียด: ${document.getElementById('description').value || '-'}\n\nกรุณาตรวจสอบข้อมูลและหมวดหมู่ให้ถูกต้องก่อนกดบันทึกนะครับ`
    : `Slip scanned successfully! 🎉\n\n- Amount: ${parsedAmount ? parsedAmount.toFixed(2) : '-'} THB\n- Date: ${formattedTransDate}\n- Details: ${document.getElementById('description').value || '-'}\n\nPlease verify all fields and category before saving.`;
  alert(alertMsg);
}

// ฟังก์ชันส่งรายงานสรุปรายจ่ายประจำวันเข้า LINE แบบแมนนวล (เปิด Modal ยืนยัน)
function triggerManualDailySummary() {
  const lang = localStorage.getItem('lang') || 'th';
  
  // ซ่อนเมนูโปรไฟล์หลังจากคลิก
  const menu = document.getElementById('profileDropdownMenu');
  const trigger = document.getElementById('userProfileTrigger');
  if (menu) menu.classList.remove('show');
  if (trigger) trigger.classList.remove('active');

  const modal = document.getElementById('confirmSendLineModal');
  if (modal) {
    // ปรับแต่งข้อความตามภาษาที่ใช้
    const titleSpan = modal.querySelector('.modal-title span');
    const descP = modal.querySelector('p');
    const cancelBtn = modal.querySelector('button[onclick="closeConfirmSendLineModal()"]');
    const confirmBtn = modal.querySelector('button[onclick="executeSendLine()"]');

    if (titleSpan) titleSpan.textContent = lang === 'th' ? 'ส่งข้อมูลไป LINE? 📤' : 'Send summary to LINE? 📤';
    if (descP) descP.textContent = lang === 'th'
      ? 'ส่งสรุปรายรับ-รายจ่ายของวันนี้ไปยังกลุ่ม LINE ของครอบครัวทันที'
      : 'Send today\'s income and expense summary to the family LINE group immediately.';
    if (cancelBtn) cancelBtn.textContent = lang === 'th' ? 'ยกเลิก' : 'Cancel';
    if (confirmBtn) confirmBtn.innerHTML = lang === 'th' ? 'ส่งเลย! 🚀' : 'Send! 🚀';

    modal.style.display = 'flex';
  }
}

// ปิด Modal ยืนยันส่ง LINE
function closeConfirmSendLineModal() {
  const modal = document.getElementById('confirmSendLineModal');
  if (modal) modal.style.display = 'none';
}

// ส่งรายงานสรุปไป LINE จริงเมื่อกดยืนยันใน Modal
async function executeSendLine() {
  const lang = localStorage.getItem('lang') || 'th';
  try {
    const res = await fetch(`${basePath}/api/line-bot/send-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    if (data.success) {
      alert(data.message);
    } else {
      alert(data.message || (lang === 'th' ? 'เกิดข้อผิดพลาดในการส่งข้อมูล' : 'Error sending data.'));
    }
  } catch (error) {
    console.error('Error sending manual daily summary to LINE:', error);
    alert(lang === 'th' ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้' : 'Cannot connect to the server at this time.');
  } finally {
    closeConfirmSendLineModal();
  }
}


// =============================================
// BUDGET PLANNER - วางแผนรายรับ/รายจ่ายเดือนหน้า
// =============================================

// Storage key สำหรับ localStorage
function getBudgetStorageKey() {
  const next = getNextMonthInfo();
  return `budgetPlan_${next.year}_${next.month}`;
}

// คำนวณเดือนถัดไป
function getNextMonthInfo() {
  const now = new Date();
  let month = now.getMonth() + 2; // +1 เพราะ getMonth() เริ่มที่ 0, +1 อีกสำหรับเดือนถัดไป
  let year = now.getFullYear();
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return { month, year };
}

// โหลดข้อมูลจาก localStorage
function loadBudgetPlan() {
  const key = getBudgetStorageKey();
  const raw = localStorage.getItem(key);
  if (!raw) return { income: [], expense: [] };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { income: [], expense: [] };
  }
}

// บันทึกข้อมูลลง localStorage
function saveBudgetPlan(plan) {
  const key = getBudgetStorageKey();
  localStorage.setItem(key, JSON.stringify(plan));
}

// เริ่มต้นหน้าวางแผนงบประมาณ
function initBudgetPlanner() {
  // อัปเดต label เดือน
  const { month, year } = getNextMonthInfo();
  const lang = localStorage.getItem('lang') || 'th';
  const monthNamesArr = monthNames[lang] || monthNames['th'];
  const monthName = monthNamesArr[month - 1];
  const yearDisplay = lang === 'th' ? year + 543 : year;
  const label = document.getElementById('budgetMonthLabel');
  if (label) {
    label.textContent = `📅 วางแผนสำหรับเดือน ${monthName} ${yearDisplay}`;
  }

  renderBudgetPlanner();
}

// แสดงผลทั้งหมด
function renderBudgetPlanner() {
  const plan = loadBudgetPlan();

  // Render income list
  renderBudgetList('income', plan.income);
  // Render expense list
  renderBudgetList('expense', plan.expense);

  // Update summary
  updateBudgetSummary(plan);
}

// สร้าง HTML รายการ
function renderBudgetList(type, items) {
  const listEl = document.getElementById(type === 'income' ? 'budgetIncomeList' : 'budgetExpenseList');
  const countEl = document.getElementById(type === 'income' ? 'budgetIncomeCount' : 'budgetExpenseCount');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${items.length} รายการ`;

  if (items.length === 0) {
    listEl.innerHTML = type === 'income'
      ? '<p class="budget-empty-hint"><i class="fa-solid fa-inbox"></i> ยังไม่มีรายรับที่วางแผนไว้</p>'
      : '<p class="budget-empty-hint"><i class="fa-solid fa-inbox"></i> ยังไม่มีรายจ่ายที่วางแผนไว้</p>';
    return;
  }

  listEl.innerHTML = items.map((item, index) => `
    <div class="budget-item-row">
      <div class="budget-item-icon ${type}-icon">
        <i class="fa-solid ${type === 'income' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
      </div>
      <div class="budget-item-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
      <div class="budget-item-amount ${type}-amt">${formatCurrencyCompact(item.amount)}</div>
      <button class="budget-item-delete" onclick="editBudgetItem('${type}', ${index})" title="แก้ไขรายการนี้" style="margin-left: 6px; color: var(--income-color);">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="budget-item-delete" onclick="deleteBudgetItem('${type}', ${index})" title="ลบรายการนี้">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

// อัปเดตสรุปยอด
function updateBudgetSummary(plan) {
  const totalIncome = plan.income.reduce((s, i) => s + i.amount, 0);
  const totalExpense = plan.expense.reduce((s, i) => s + i.amount, 0);
  const net = totalIncome - totalExpense;

  const incomeEl = document.getElementById('budgetTotalIncome');
  const expenseEl = document.getElementById('budgetTotalExpense');
  const netEl = document.getElementById('budgetNetAmount');
  const ratioEl = document.getElementById('budgetExpenseRatio');
  const fillEl = document.getElementById('budgetProgressFill');

  if (incomeEl) incomeEl.textContent = formatCurrencyCompact(totalIncome);
  if (expenseEl) expenseEl.textContent = formatCurrencyCompact(totalExpense);
  if (netEl) {
    netEl.textContent = formatCurrencyCompact(Math.abs(net)) + (net < 0 ? ' (ติดลบ)' : ' ฿');
    if (net >= 0) {
      netEl.textContent = formatCurrencyCompact(net) + ' ฿';
      netEl.classList.remove('negative');
    } else {
      netEl.textContent = '-' + formatCurrencyCompact(Math.abs(net)) + ' ฿';
      netEl.classList.add('negative');
    }
  }

  const ratio = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : (totalExpense > 0 ? 100 : 0);
  const ratioRounded = Math.round(ratio);

  if (ratioEl) ratioEl.textContent = ratioRounded + '%';
  if (fillEl) {
    fillEl.style.width = ratioRounded + '%';
    if (ratio >= 85) {
      fillEl.classList.add('danger');
    } else {
      fillEl.classList.remove('danger');
    }
  }
}

// เพิ่มรายการ
function addBudgetItem(type) {
  const labelInput = document.getElementById(type === 'income' ? 'budgetIncomeLabel' : 'budgetExpenseLabel');
  const amountInput = document.getElementById(type === 'income' ? 'budgetIncomeAmount' : 'budgetExpenseAmount');

  const label = labelInput ? labelInput.value.trim() : '';
  const amount = parseFloat(amountInput ? amountInput.value : 0);

  if (!label) {
    labelInput.focus();
    labelInput.style.borderColor = 'var(--expense-color)';
    setTimeout(() => { labelInput.style.borderColor = ''; }, 1500);
    return;
  }
  if (!amount || amount <= 0) {
    amountInput.focus();
    amountInput.style.borderColor = 'var(--expense-color)';
    setTimeout(() => { amountInput.style.borderColor = ''; }, 1500);
    return;
  }

  const plan = loadBudgetPlan();
  plan[type].push({ label, amount, addedAt: new Date().toISOString() });
  saveBudgetPlan(plan);

  // ล้างฟอร์ม
  if (labelInput) labelInput.value = '';
  if (amountInput) amountInput.value = '';

  renderBudgetPlanner();
}

// แก้ไขรายการ (เปิด Modal)
function editBudgetItem(type, index) {
  const plan = loadBudgetPlan();
  const item = plan[type][index];
  if (!item) return;

  const modal = document.getElementById('editBudgetModal');
  const typeInput = document.getElementById('editBudgetType');
  const indexInput = document.getElementById('editBudgetIndex');
  const labelInput = document.getElementById('editBudgetLabel');
  const amountInput = document.getElementById('editBudgetAmount');

  if (modal && typeInput && indexInput && labelInput && amountInput) {
    typeInput.value = type;
    indexInput.value = index;
    labelInput.value = item.label;
    amountInput.value = item.amount;
    modal.style.display = 'flex';
  }
}

// ปิด Modal แก้ไขรายการ
function closeEditBudgetModal() {
  const modal = document.getElementById('editBudgetModal');
  if (modal) modal.style.display = 'none';
}

// บันทึกการแก้ไขจาก Modal
function saveEditedBudgetItem(event) {
  event.preventDefault();

  const type = document.getElementById('editBudgetType').value;
  const index = parseInt(document.getElementById('editBudgetIndex').value);
  const label = document.getElementById('editBudgetLabel').value.trim();
  const amount = parseFloat(document.getElementById('editBudgetAmount').value);

  if (!label) return;
  if (isNaN(amount) || amount <= 0) return;

  const plan = loadBudgetPlan();
  if (plan[type] && plan[type][index]) {
    plan[type][index].label = label;
    plan[type][index].amount = amount;
    saveBudgetPlan(plan);
    renderBudgetPlanner();
  }

  closeEditBudgetModal();
}

// ลบรายการ
function deleteBudgetItem(type, index) {
  const plan = loadBudgetPlan();
  plan[type].splice(index, 1);
  saveBudgetPlan(plan);
  renderBudgetPlanner();
}

// ล้างทั้งหมด (เปิด Modal ยืนยัน)
function clearBudgetPlan() {
  const lang = localStorage.getItem('lang') || 'th';
  const modal = document.getElementById('confirmClearBudgetModal');
  if (modal) {
    // ปรับแต่งข้อความตามภาษาที่ใช้
    const titleSpan = modal.querySelector('.modal-title span');
    const descP = modal.querySelector('p');
    const cancelBtn = modal.querySelector('button[onclick="closeConfirmClearBudgetModal()"]');
    const confirmBtn = modal.querySelector('button[onclick="executeClearBudgetPlan()"]');

    if (titleSpan) titleSpan.textContent = lang === 'th' ? 'ล้างแผนเดือนหน้าทั้งหมด? 🧹' : 'Clear all budget plans? 🧹';
    if (descP) descP.textContent = lang === 'th'
      ? 'รายการวางแผนรายรับ-รายจ่ายทั้งหมดของเดือนหน้าจะถูกลบทิ้งทั้งหมด'
      : 'All planned incomes and expenses for next month will be completely deleted.';
    if (cancelBtn) cancelBtn.textContent = lang === 'th' ? 'ยกเลิก' : 'Cancel';
    if (confirmBtn) confirmBtn.innerHTML = lang === 'th' ? 'ล้างข้อมูล 🗑_' : 'Clear 🗑_';
    
    // แทนที่สัญลักษณ์ 🗑_ ด้วย 🗑️
    if (confirmBtn) confirmBtn.innerHTML = confirmBtn.innerHTML.replace('🗑_', '🗑️');

    modal.style.display = 'flex';
    // โฟกัสไปที่ปุ่มล้างข้อมูล เพื่อให้กด Enter ได้ทันที
    setTimeout(() => {
      document.getElementById('btnConfirmClearBudget')?.focus();
    }, 50);
  }
}

// ปิด Modal ยืนยันล้างงบ
function closeConfirmClearBudgetModal() {
  const modal = document.getElementById('confirmClearBudgetModal');
  if (modal) modal.style.display = 'none';
}

// ทำการล้างงบเดือนหน้าจริงเมื่อกดยืนยันใน Modal
function executeClearBudgetPlan() {
  const key = getBudgetStorageKey();
  localStorage.removeItem(key);
  renderBudgetPlanner();
  closeConfirmClearBudgetModal();
}

// Helper: format สกุลเงิน (compact)
function formatCurrencyCompact(amount) {
  return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper: escape HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

