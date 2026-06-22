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

// ไอคอนอวตารน่ารักๆ
const avatarMap = {
  'dad': '👨',
  'mom': '👩',
  'kid': '👦',
  'default': '🏠'
};

// เมื่อหน้าเว็บโหลดเสร็จ
window.onload = async () => {
  // 1. ตรวจสอบการล็อกอิน
  const isLoggedIn = await checkAuth();
  if (!isLoggedIn) return;

  // 2. ตั้งควันวันที่เริ่มต้นในฟอร์มเป็น วันนี้
  setTodayDate();

  // 3. ตั้งค่าปีและเดือนในส่วนตัวกรองเป็น เดือน/ปี ปัจจุบัน
  setupFilters();

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
      document.getElementById('headerDisplayName').textContent = currentUser.displayName;
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
function setupFilters() {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // ตั้งค่าเดือน
  document.getElementById('filterMonth').value = currentMonth;

  // ตั้งค่าปี (ย้อนหลัง 2 ปี และไปข้างหน้า 1 ปี)
  const filterYearSelect = document.getElementById('filterYear');
  filterYearSelect.innerHTML = '';
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    const option = document.createElement('option');
    option.value = y;
    option.textContent = y + 543; // แปลงเป็น พ.ศ. แสดงน่ารักๆ
    if (y === currentYear) option.selected = true;
    filterYearSelect.appendChild(option);
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
        option.textContent = `${avatarEmoji} ${user.display_name}`;
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
function populateCategoryDropdown() {
  const mainSelect = document.getElementById('mainCategory');
  if (mainSelect) {
    mainSelect.innerHTML = '<option value="" disabled selected>-- เลือกหมวดหมู่หลัก --</option>';
  }

  // ซ่อนหมวดหมู่ย่อยเป็นค่าเริ่มต้น
  const subCategoryGroup = document.getElementById('subCategoryGroup');
  if (subCategoryGroup) subCategoryGroup.style.display = 'none';
  const categorySelect = document.getElementById('categoryId');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="" disabled selected>-- เลือกหมวดหมู่ย่อย --</option>';
    categorySelect.removeAttribute('required');
  }

  // ดึงกลุ่มของ parent_category ที่ไม่ซ้ำกันสำหรับประเภทธุรกรรมนี้
  const uniqueParents = [];
  categoriesList.forEach(c => {
    if (c.type === activeTransactionType && c.parent_category) {
      if (!uniqueParents.includes(c.parent_category)) {
        uniqueParents.push(c.parent_category);
      }
    }
  });

  // เติมหมวดหมู่หลักใน dropdown
  if (mainSelect) {
    uniqueParents.forEach(parent => {
      const option = document.createElement('option');
      option.value = parent;
      option.textContent = parent;
      mainSelect.appendChild(option);
    });
  }

  // ล้างการแสดงผลฟิลด์รถ EV และ มื้ออาหาร ทุกครั้งที่เปลี่ยนประเภท
  const evSection = document.getElementById('evDetailsSection');
  if (evSection) evSection.classList.remove('show');
  const mealGroup = document.getElementById('mealTypeGroup');
  if (mealGroup) mealGroup.style.display = 'none';
  const recipientGroup = document.getElementById('recipientGroup');
  if (recipientGroup) recipientGroup.style.display = 'none';
}

// เมื่อเลือกหมวดหมู่หลักแล้ว ค่อยให้เลือกหมวดหมู่ย่อย
function onMainCategoryChange() {
  const mainSelect = document.getElementById('mainCategory');
  const selectedParent = mainSelect.value;
  const categorySelect = document.getElementById('categoryId');
  const subCategoryGroup = document.getElementById('subCategoryGroup');

  if (!selectedParent) {
    if (subCategoryGroup) subCategoryGroup.style.display = 'none';
    if (categorySelect) categorySelect.removeAttribute('required');
    return;
  }

  // กรองหมวดหมู่ย่อยที่มี parent_category ตรงกัน และ type ตรงกัน
  const subCategories = categoriesList.filter(c => c.type === activeTransactionType && c.parent_category === selectedParent);

  if (subCategories.length > 1) {
    // แสดงดรอปดาวน์หมวดหมู่ย่อย
    if (subCategoryGroup) subCategoryGroup.style.display = 'block';
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="" disabled selected>-- เลือกหมวดหมู่ย่อย --</option>';
      categorySelect.setAttribute('required', 'required');
      
      subCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categorySelect.appendChild(option);
      });
    }

    // ซ่อนกล่อง EV และกลุ่มพิเศษอื่น ๆ ก่อนจนกว่าจะเลือกหมวดหมู่ย่อย
    const evSection = document.getElementById('evDetailsSection');
    if (evSection) evSection.classList.remove('show');
    const mealGroup = document.getElementById('mealTypeGroup');
    if (mealGroup) mealGroup.style.display = 'none';
    const recipientGroup = document.getElementById('recipientGroup');
    if (recipientGroup) recipientGroup.style.display = 'none';

  } else if (subCategories.length === 1) {
    // ซ่อนดรอปดาวน์หมวดหมู่ย่อย และเลือกหมวดหมู่นั้นอัตโนมัติ
    if (subCategoryGroup) subCategoryGroup.style.display = 'none';
    if (categorySelect) {
      categorySelect.removeAttribute('required');
      categorySelect.innerHTML = '';
      
      const cat = subCategories[0];
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      option.selected = true;
      categorySelect.appendChild(option);
      
      // เรียกใช้ฟังก์ชันตรวจสอบประเภทหมวดหมู่เพื่อแสดงฟิลด์พิเศษ
      checkCategoryType(categorySelect);
    }
  } else {
    // ไม่มีหมวดหมู่ย่อย
    if (subCategoryGroup) subCategoryGroup.style.display = 'none';
    if (categorySelect) {
      categorySelect.removeAttribute('required');
      categorySelect.innerHTML = '';
    }
  }
}

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
function checkCategoryType(selectElement) {
  if (!selectElement || selectElement.selectedIndex === -1 || !selectElement.options[selectElement.selectedIndex]) {
    return;
  }
  const selectedText = selectElement.options[selectElement.selectedIndex].text;
  const evSection = document.getElementById('evDetailsSection');
  const mealGroup = document.getElementById('mealTypeGroup');

  // ตรวจจับคีย์เวิร์ดเช่น 'EV' หรือ 'ชาร์จไฟ'
  if (selectedText.includes('EV') || selectedText.includes('ชาร์จไฟ')) {
    evSection.classList.add('show');
    updateEVDescription();
  } else {
    evSection.classList.remove('show');
  }

  // ตรวจจับหมวดหมู่อาหาร
  if (mealGroup) {
    if (selectedText.includes('อาหาร') || selectedText.includes('เครื่องดื่ม')) {
      mealGroup.style.display = 'block';
    } else {
      mealGroup.style.display = 'none';
    }
  }

  // ตรวจจับหมวดหมู่ให้ครอบครัว
  const recipientGroup = document.getElementById('recipientGroup');
  if (recipientGroup) {
    if (selectedText.includes('ให้ครอบครัว') || selectedText.includes('คนในบ้าน')) {
      recipientGroup.style.display = 'block';
    } else {
      recipientGroup.style.display = 'none';
    }
  }
}

// โหลดรายการธุรกรรมเงิน และอัปเดต Dashboard
async function fetchTransactions() {
  const month = document.getElementById('filterMonth').value;
  const year = document.getElementById('filterYear').value;
  const userId = document.getElementById('filterUser').value;
  const filterPayment = document.getElementById('filterPayment').value;

  try {
    // แยกเงินกันรายบุคคล ไม่นำมารวมกัน (ถ้ายังไม่มีการเลือกในดรอปดาวน์ให้ใช้ของผู้ใช้ที่ล็อกอินอยู่)
    const targetUserId = userId || (currentUser ? currentUser.id : '');
    let url = `${basePath}/api/transactions?month=${month}&year=${year}`;
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
      calculateDashboardSummary(data.transactions);
      await fetchUnpaidCredits(); // โหลดข้อมูลบัตรเครดิตค้างชำระ
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// แสดงรายการข้อมูลเงินบนหน้าเว็บ
function renderTransactions(transactions) {
  const listContainer = document.getElementById('transactionsList');
  listContainer.innerHTML = '';

  if (transactions.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 30px;">
        <i class="fa-solid fa-cookie-bite" style="font-size: 2.5rem; margin-bottom: 10px; color: #EADBC8;"></i>
        <p>เดือนนี้ยังไม่มีบันทึกเงินเลยจ้า</p>
      </div>
    `;
    return;
  }

  transactions.forEach(t => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const isEV = t.station_name || t.charger_power || t.energy_delivered;
    const formattedDate = new Date(t.transaction_date).toLocaleDateString('th-TH', {
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
        badgeHTML += `<span class="ev-badge" style="background-color: #FFF2E2; color: #E29734; border-color: #E29734;"><i class="fa-solid fa-credit-card"></i> ค้างจ่าย${cardSuffix} 💳</span>`;
      } else if (t.credit_status === 'paid') {
        badgeHTML += `<span class="ev-badge" style="background-color: var(--income-bg); color: var(--income-color); border-color: var(--income-color);"><i class="fa-solid fa-circle-check"></i> จ่ายแล้ว${cardSuffix} ✅</span>`;
      }
    }
    if (t.meal_type) {
      const mealIcons = { 'เช้า': '🌅', 'กลางวัน': '☀️', 'เย็น': '🌇', 'ดึก': '🌙' };
      const icon = mealIcons[t.meal_type] || '🍴';
      badgeHTML += `<span class="ev-badge" style="background-color: #E8F5E9; color: #2E7D32; border-color: #2E7D32;"><i class="fa-solid fa-utensils"></i> มื้อ${t.meal_type} ${icon}</span>`;
    }
    if (t.recipient) {
      const recipientIcons = { 'ย่า': '👵', 'แม่': '👩', 'ลูก': '👦', 'ญาติ': '👥' };
      const icon = recipientIcons[t.recipient] || '👤';
      badgeHTML += `<span class="ev-badge" style="background-color: #F3E5F5; color: #7B1FA2; border-color: #7B1FA2;"><i class="fa-solid fa-heart"></i> ให้${t.recipient} ${icon}</span>`;
    }

    item.innerHTML = `
      <div class="item-left">
        <div class="item-icon" style="background-color: ${t.category_color || '#888'}">
          <i class="fa-solid ${t.category_icon || 'fa-question'}"></i>
        </div>
        <div class="item-details">
          <h4>
            ${t.category_name}
            ${badgeHTML}
          </h4>
          <p>${formattedDate} • ${t.description || 'ไม่มีคำอธิบาย'}</p>
          <div class="item-badge-user">
            <span>${t.avatar && (t.avatar.startsWith('http://') || t.avatar.startsWith('https://')) ? `<img src="${t.avatar}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 4px;" alt="avatar">` : (avatarMap[t.avatar] || '👤')}</span>
            <span>${t.display_name}</span>
          </div>
        </div>
      </div>
      <div class="item-right">
        <span class="item-amount ${t.type}">
          ${t.type === 'income' ? '+' : '-'}${parseFloat(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
        </span>
        <button class="btn-delete" onclick="startEditTransaction(${t.id})" title="แก้ไขรายการนี้" style="color: var(--ev-color); margin-right: 5px;">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn-delete" onclick="deleteTransaction(${t.id})" title="ลบรายการนี้">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

// คำนวณสรุปยอดเงินและอัปเดตการ์ด Dashboard
function calculateDashboardSummary(transactions) {
  let incomeTotal = 0;
  let expenseTotal = 0;

    transactions.forEach(t => {
    const amt = parseFloat(t.amount);
    if (t.type === 'income') {
      incomeTotal += amt;
    } else {
      // หักเงินสดจริงเฉพาะเมื่อไม่ใช่วิธีรูดบัตร (credit) เพื่อไม่ให้หักเงินซ้ำซ้อนในสมุดบัญชีก่อนโอนเงินจ่ายจริง
      if (t.payment_method !== 'credit') {
        expenseTotal += amt;
      }
    }
  });

  const balance = incomeTotal - expenseTotal;

  // อัปเดตยอดเงินคงเหลือ
  const balEl = document.getElementById('totalBalance');
  balEl.textContent = `${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
  if (balance >= 0) {
    balEl.style.color = 'var(--income-color)';
  } else {
    balEl.style.color = 'var(--expense-color)';
  }

  document.getElementById('totalIncome').textContent = `${incomeTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
  document.getElementById('totalExpense').textContent = `${expenseTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
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
      alert(data.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

// ลบธุรกรรมการเงิน
async function deleteTransaction(id) {
  if (!confirm('แน่ใจนะว่าจะลบรายการนี้? 🥺')) return;

  try {
    const res = await fetch(`${basePath}/api/transactions/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      await fetchTransactions();
    } else {
      alert(data.message || 'ลบไม่สำเร็จ');
    }
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
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
}

// สร้างกราฟวิเคราะห์ (Analytics Charts)
async function renderAnalyticsCharts() {
  const month = document.getElementById('filterMonth').value;
  const year = document.getElementById('filterYear').value;
  const userId = document.getElementById('filterUser').value;

  try {
    let url = `${basePath}/api/transactions?month=${month}&year=${year}`;
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

      const labels = Object.keys(expenseMap);
      const values = Object.values(expenseMap);
      const colors = Object.values(expenseColors);

      if (labels.length === 0) {
        // หากไม่มีข้อมูล ให้วาดกราฟเปล่า
        categoryChartInstance = new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: ['ไม่มีข้อมูลรายจ่าย'],
            datasets: [{
              data: [1],
              backgroundColor: ['#F3ECE3']
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
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
              borderColor: '#FFFFFF'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: { family: 'Kanit' } }
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
          labels: ['รายรับ 💰', 'รายจ่าย 💸'],
          datasets: [{
            label: 'ยอดรวมประจำเดือน (บาท)',
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
              ticks: { font: { family: 'Kanit' } }
            },
            x: {
              ticks: { font: { family: 'Kanit' } }
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

      // อัปเดตการ์ดสถิติ EV
      document.getElementById('evTotalCost').textContent = `${parseFloat(stats.totalCost).toLocaleString('th-TH')} ฿`;
      document.getElementById('evTotalKWh').textContent = `${parseFloat(stats.totalKWh).toLocaleString('th-TH')} kWh`;
      document.getElementById('evAvgCostPerKWh').textContent = `${stats.costPerKWh} ฿`;
      document.getElementById('evCostPerKm').textContent = stats.totalDistance > 0 ? `${stats.costPerKm} ฿` : 'ไม่มีข้อมูลเปรียบเทียบ';
      document.getElementById('evAvgEfficiency').textContent = stats.totalDistance > 0 ? `${stats.kmPerKWh} km/kWh` : 'ไม่มีข้อมูลเปรียบเทียบ';
      document.getElementById('evTotalDistance').textContent = stats.totalDistance > 0 ? `${stats.totalDistance.toLocaleString('th-TH')} km` : 'สะสมขั้นต่ำ 2 ครั้ง';

      // อัปเดตตารางประวัติ EV
      const tableBody = document.getElementById('evLogsTableBody');
      tableBody.innerHTML = '';

      if (logs.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">
              ไม่มีข้อมูลประวัติการชาร์จรถไฟฟ้าเลยจ้า
            </td>
          </tr>
        `;
        return;
      }

      logs.forEach((log, index) => {
        const tr = document.createElement('tr');
        const formattedDate = new Date(log.transaction_date).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

        // คำนวณช่วงการสิ้นเปลืองของรอบนี้เมื่อเทียบกับรอบก่อนหน้า (หากมี)
        let rowOdoInfo = log.odometer ? `${log.odometer.toLocaleString()} km` : '-';
        
        let badgeHTML = '';
        if (log.payment_method === 'credit') {
          if (log.credit_status === 'unpaid') {
            badgeHTML = `<br><span class="ev-badge" style="background-color: #FFF2E2; color: #E29734; border-color: #E29734; font-size: 0.7rem; padding: 1px 6px; margin: 2px 0 0 0; display: inline-flex;"><i class="fa-solid fa-credit-card"></i> ค้างจ่าย 💳</span>`;
          } else if (log.credit_status === 'paid') {
            badgeHTML = `<br><span class="ev-badge" style="background-color: var(--income-bg); color: var(--income-color); border-color: var(--income-color); font-size: 0.7rem; padding: 1px 6px; margin: 2px 0 0 0; display: inline-flex;"><i class="fa-solid fa-circle-check"></i> จ่ายแล้ว ✅</span>`;
          }
        }
        
        tr.innerHTML = `
          <td data-label="วันที่ชาร์จ">${formattedDate}</td>
          <td data-label="คนบันทึก">${log.display_name}</td>
          <td data-label="สถานีชาร์จ"><strong>${log.station_name || '-'}${log.station_branch ? ` สาขา ${log.station_branch}` : ''}${log.station_cabinet ? ` ตู้ ${log.station_cabinet}` : ''}</strong></td>
          <td data-label="หัวชาร์จ">${log.charger_power ? `${log.charger_power} kW` : '-'}</td>
          <td data-label="ปริมาณไฟ">${log.energy_delivered ? `${parseFloat(log.energy_delivered).toFixed(1)} kWh` : '-'}</td>
          <td data-label="แบตเตอรี่">
            ${log.start_battery !== null && log.end_battery !== null ? `${log.start_battery}% ➔ ${log.end_battery}%` : '-'}
          </td>
          <td data-label="เลขไมล์">${rowOdoInfo}</td>
          <td data-label="ค่าชาร์จ">
            <strong>${parseFloat(log.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</strong>
            ${badgeHTML}
          </td>
          <td class="mobile-only-cell">
            <button class="btn-toggle-ev-details" onclick="toggleEVRowDetails(this)">
              <i class="fa-solid fa-chevron-down"></i> ดูรายละเอียด
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

// เริ่มเข้าสู่โหมดแก้ไขรายการ
function startEditTransaction(id) {
  const t = currentTransactions.find(item => item.id === id);
  if (!t) return;

  editTransactionId = id;
  editCreditStatus = t.credit_status || 'none';

  // เลื่อนจอไปที่ฟอร์มด้านบนอย่างนุ่มนวล
  document.getElementById('transactionForm').scrollIntoView({ behavior: 'smooth' });

  // โหลดค่าของรายการเข้าสู่ฟอร์ม
  setTransactionType(t.type);
  document.getElementById('amount').value = parseFloat(t.amount);
  
  // ตั้งค่าหมวดหมู่
  const category = categoriesList.find(c => c.id === t.category_id);
  if (category) {
    const mainSelect = document.getElementById('mainCategory');
    if (mainSelect) {
      mainSelect.value = category.parent_category;
      onMainCategoryChange();
    }
    const categorySelect = document.getElementById('categoryId');
    if (categorySelect) {
      categorySelect.value = t.category_id;
      checkCategoryType(categorySelect);
    }
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
  document.getElementById('evChargerPower').value = t.charger_power || '';
  document.getElementById('evEnergyDelivered').value = t.energy_delivered || '';
  document.getElementById('evOdometer').value = t.odometer || '';
  document.getElementById('evStartBattery').value = t.start_battery !== null ? t.start_battery : '';
  document.getElementById('evEndBattery').value = t.end_battery !== null ? t.end_battery : '';

  // ปรับ UI ให้เป็นโหมดแก้ไข
  document.querySelector('#transactions-tab .card-title').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> แก้ไขรายการของฉัน`;
  
  const submitBtn = document.querySelector('#transactionForm button[type="submit"]');
  submitBtn.innerHTML = `บันทึกการแก้ไข! ✏️`;
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
    cancelBtn.innerHTML = `ยกเลิกการแก้ไข ❌`;
    cancelBtn.onclick = cancelEditMode;
    document.getElementById('transactionForm').appendChild(cancelBtn);
  }
}

// ยกเลิกโหมดแก้ไข รีเซ็ตฟอร์มกลับเป็นโหมดบันทึกปกติ
function cancelEditMode() {
  editTransactionId = null;
  editCreditStatus = 'none';

  document.querySelector('#transactions-tab .card-title').innerHTML = `<i class="fa-solid fa-heart-circle-plus"></i> บันทึกรายการใหม่`;
  
  const submitBtn = document.querySelector('#transactionForm button[type="submit"]');
  submitBtn.innerHTML = `บันทึกรายการเลย! ✨`;
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
  
  // กรองรายการตามบัตรเครดิตที่เลือก
  const filtered = activeCreditCardFilter === 'all'
    ? unpaidTransactionsList
    : unpaidTransactionsList.filter(t => t.credit_card_name === activeCreditCardFilter);
  
  // คำนวณยอดหนี้ค้างชำระรวมทั้งหมดของคนนี้ (ไม่สนใจฟิลเตอร์เพื่อแสดงหนี้สินรวมจริงในภาพรวม)
  let totalUnpaid = 0;
  unpaidTransactionsList.forEach(t => {
    totalUnpaid += parseFloat(t.amount);
  });
  
  document.getElementById('totalUnpaidCredit').textContent = `${totalUnpaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
  const creditOutstandingEl = document.getElementById('totalCreditOutstanding');
  if (creditOutstandingEl) {
    creditOutstandingEl.textContent = `${totalUnpaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 25px; font-size: 0.85rem;">
        <i class="fa-solid fa-face-smile" style="font-size: 1.5rem; margin-bottom: 5px; color: var(--income-color);"></i>
        <p>${activeCreditCardFilter === 'all' ? 'ไม่มียอดค้างชำระบัตรเครดิตเลยจ้า! 🌸' : 'ไม่มียอดค้างชำระของบัตรนี้เลยจ้า! 🌸'}</p>
      </div>
    `;
    actionArea.style.display = 'none';
    return;
  }
  
  filtered.forEach(t => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.padding = '8px 12px';
    div.style.border = '2px solid var(--border-color)';
    div.style.borderRadius = '12px';
    div.style.backgroundColor = '#FCFAF7';
    div.style.fontSize = '0.85rem';
    
    const formattedDate = new Date(t.transaction_date).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short'
    });
    
    const cardDisplay = t.credit_card_name ? ` (${t.credit_card_name})` : '';
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" class="credit-checkbox" value="${t.id}" data-amount="${t.amount}" style="width: 16px; height: 16px; cursor: pointer;" onchange="updateSelectedCreditAmount()">
        <div>
          <strong>${t.category_name}</strong><span style="color: var(--ev-color); font-weight: 500;">${cardDisplay}</span> - ${t.description || 'ไม่มีคำอธิบาย'}<br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${formattedDate}</span>
        </div>
      </div>
      <strong style="color: var(--expense-color);">${parseFloat(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</strong>
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
  const checkboxes = document.querySelectorAll('.credit-checkbox:checked');
  let selectedSum = 0;
  checkboxes.forEach(cb => {
    selectedSum += parseFloat(cb.getAttribute('data-amount') || 0);
  });
  document.getElementById('selectedCreditAmount').textContent = `${selectedSum.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿`;
}

// ชำระยอดหนี้ที่เลือก (ส่งไปยัง API หักยอดเงินสดจริงในบัญชี)
async function payCreditTransactions() {
  const checkboxes = document.querySelectorAll('.credit-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('กรุณาเลือกรายการค้างชำระอย่างน้อย 1 รายการครับ');
    return;
  }
  
  const transactionIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const paymentDate = document.getElementById('creditPayDate').value;
  
  if (!paymentDate) {
    alert('กรุณาระบุวันที่ชำระเงินด้วยครับ');
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
      alert(data.message || 'ชำระยอดเครดิตไม่สำเร็จ');
    }
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

// จัดการการ Logout
async function handleLogout() {
  if (!confirm('ออกจากระบบใช่ไหมครับบ๊ายบาย? 👋')) return;

  try {
    const res = await fetch(basePath + '/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      window.location.href = basePath + '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    alert('เกิดข้อผิดพลาดในการออกจากระบบ');
  }
}

// ฟังก์ชันอัปเดตคำอธิบายรายการชาร์จรถ EV อัตโนมัติจากชื่อสถานีและสาขา
function updateEVDescription() {
  const categorySelect = document.getElementById('categoryId');
  if (!categorySelect) return;
  const selectedText = categorySelect.options[categorySelect.selectedIndex]?.text || '';
  
  // ทำการอัปเดตเฉพาะเมื่อเป็นหมวดหมู่ EV เท่านั้น
  if (selectedText.includes('EV') || selectedText.includes('ชาร์จไฟ')) {
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

  if (newPassword !== confirmNewPassword) {
    errorDiv.textContent = 'รหัสผ่านใหม่ไม่ตรงกันจ้า กรุณากรอกใหม่อีกครั้ง';
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
      errorDiv.textContent = data.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Change password error:', error);
    errorDiv.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
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
  
  if (isExpanded) {
    button.innerHTML = '<i class="fa-solid fa-chevron-up"></i> ซ่อนรายละเอียด';
  } else {
    button.innerHTML = '<i class="fa-solid fa-chevron-down"></i> ดูรายละเอียด';
  }
}


