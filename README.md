# Cozy Home Expense Tracker 🏠 | บ้านแสนอุ่นบันทึกการเงิน

A cute, cozy, and highly responsive family expense tracker web app with an integrated EV Charging log and Credit Card tracker. Designed with a vibrant Neobrutalism aesthetic, bilingual capabilities, and smart system theme adaptation.

ระบบจดบันทึกการเงินในบ้านแสนอบอุ่นและบันทึกข้อมูลการชาร์จรถยนต์ไฟฟ้า (EV) พร้อมการคำนวณและสถิติการใช้งาน ดีไซน์ในสไตล์ Neobrutalism สีสันสดใสสะดุดตา รองรับระบบ 2 ภาษา และปรับแต่งธีมสว่าง/มืดตามระบบของอุปกรณ์

---

## 🌟 Key Features / ฟีเจอร์เด่น

### 🌐 Bilingual Support (TH / EN)
- Instant client-side language switching between Thai and English.
- Dynamic translations of standard categories, badges, table headers, alerts, and calendar eras (Buddhist Era `BE` for Thai, Christian Era `CE` for English).
- **ระบบ 2 ภาษา**: สลับภาษาไทยและอังกฤษได้ทันทีผ่านปุ่มบนหน้าจอ โดยระบบจะแปลคำศัพท์ หมวดหมู่ วันเวลา (เช่น พ.ศ. สำหรับภาษาไทย และ ค.ศ. สำหรับภาษาอังกฤษ) รวมถึงคำแจ้งเตือนต่าง ๆ ให้โดยอัตโนมัติ

### 🌗 System Theme Sync (Dark / Light Mode)
- Automatically detects and applies the host device's theme preference.
- Customizable defaults with support for manual toggles. High contrast, accessible color contrasts, and fully visible EV tables in both light and dark mode.
- **โหมดมืด/สว่างอัจฉริยะ**: ตรวจจับการตั้งค่าของอุปกรณ์ที่ใช้งานโดยอัตโนมัติ และสลับธีมสีให้เหมาะสม เข้ากันได้ดีกับสีสันสไตล์ Neobrutalism และการแสดงผลส่วน EV table ที่อ่านง่ายทุกโหมดสี

### 💳 Credit Card Outstanding Tracker
- View unpaid credit card transactions separated by cards (Kbank, BBL, TruePay, ShopeePay, etc.).
- Includes a **"Select All"** checkbox to toggle unpaid transactions instantly for quick bill payments.
- Real-time sum calculation for checked transactions.
- **ระบบค้างชำระบัตรเครดิต**: ตรวจสอบประวัติการรูดบัตรเครดิตที่ยังไม่ได้ชำระแยกตามบัตรต่าง ๆ พร้อมระบบ **"เลือกทั้งหมด" (Select All)** เพื่อช่วยให้ติ๊กชำระบิลบัตรเครดิตหลายรายการพร้อมกันได้อย่างรวดเร็ว

### ⚡ EV Charging Log
- Specially tailored for Electric Vehicles (EV) with logs for charger location, power (kW), duration, energy consumed (kWh), cost, starting/ending battery percentages, and odometer distance tracking.
- Form controls display neatly on both mobile and desktop screen sizes.
- **บันทึกการชาร์จรถไฟฟ้า**: บันทึกสถานที่ชาร์จ, กำลังไฟ (kW), เวลาชาร์จ, หน่วยไฟที่ได้ (kWh), ยอดค่าใช้จ่าย, ระดับแบตเตอรี่ (%) และบันทึกเลขไมล์เดินทาง เพื่อช่วยคำนวณและสรุปข้อมูลสถิติของรถยนต์ไฟฟ้า

### 📊 Dashboard & Charts
- Dynamic charts (Pie charts for category breakdown, line charts for monthly cash flow).
- Total family balance, monthly income, and monthly expense indicators.
- **แดชบอร์ดและกราฟวิเคราะห์**: สรุปยอดเงินคงเหลือ รายรับ/รายจ่ายประจำเดือน พร้อมกราฟสถิติจำแนกตามหมวดหมู่ค่าใช้จ่าย และแนวโน้มรายรับ/รายจ่ายในแต่ละเดือนอย่างชัดเจน

---

## 🛠️ Technology Stack / เทคโนโลยีที่ใช้
- **Backend**: Node.js, Express, `express-session` for user authentication.
- **Database**: MySQL.
- **Frontend**: Vanilla HTML5, CSS3 Custom Properties (CSS variables), JavaScript (ES6+), FontAwesome icons, Chart.js for data visualization.
- **Styling**: Cozy Neobrutalism UI (custom border shadows, rounded cards, vibrant tailored color palettes).

---

## 🚀 Setup & Installation / ขั้นตอนการติดตั้งและรันระบบ

### Requirements / สิ่งที่ต้องใช้
- [Node.js](https://nodejs.org/) (v18 or higher / หรือใหม่กว่า)
- [MySQL Database](https://www.mysql.com/) (e.g. XAMPP, Laragon, or standalone MySQL / แนะนำ XAMPP)

### Steps / ขั้นตอนการตั้งค่า

1. **Clone this repository / โคลนโปรเจกต์นี้**:
   ```bash
   git clone https://github.com/thanatthanan/ex.git
   cd ex
   ```

2. **Database Setup / ตั้งค่าฐานข้อมูล**:
   - Start your MySQL server.
   - Create a database named `family_expense`.
   - Import the database schema from the `database.sql` file in the root directory.
   - *เริ่มรัน MySQL server (เช่น เปิด Apache และ MySQL ใน XAMPP Control Panel) จากนั้นสร้างฐานข้อมูลชื่อ `family_expense` และนำเข้าไฟล์ `database.sql` ในโปรเจกต์นี้เข้าไป*

3. **Configure Environment Variables / ตั้งค่าตัวแปรระบบ**:
   - Copy `.env.example` and rename it to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Update database credentials inside `.env` to match your local setup:
     ```env
     PORT=3000
     DB_HOST=localhost
     DB_USER=root
     DB_PASSWORD=your_mysql_password
     DB_NAME=family_expense
     SESSION_SECRET=your_custom_secret_key
     ```

4. **Install Dependencies / ติดตั้งไลบรารีที่จำเป็น**:
   ```bash
   npm install
   ```

5. **Run the Server / รันเซิร์ฟเวอร์**:
   - To start in production mode / *รันปกติ*:
     ```bash
     npm start
     ```
   - To start in development watch mode / *รันโหมดพัฒนา (Watch mode)*:
     ```bash
     npm run dev
     ```
   - Open your browser and navigate to `http://localhost:3000` to access the app.

---

## 📂 Project Structure / โครงสร้างโฟลเดอร์ในระบบ
```text
ex/
├── config/             # Database connection setups
├── routes/             # API routes (transactions, auth, users)
├── public/             # Static files (Frontend Assets)
│   ├── css/            # Style sheets (style.css, login.css)
│   ├── js/             # Frontend Logic scripts (app.js, translations.js)
│   ├── index.html      # Dashboard dashboard page
│   └── login.html      # Authentication / Entry page
├── server.js           # Server entry point
├── database.sql        # Database initialization script
├── .env.example        # Reference environment configuration
└── package.json        # Dependencies and scripts definitions
```

---

## 📝 License / สัญญาอนุญาต
Distributed under the MIT License. See `LICENSE` for more information.

---

Made with ❤️ for cozy family financial tracking and sustainable EV driving.
สร้างสรรค์ขึ้นด้วยความใส่ใจเพื่อช่วยให้บันทึกการเงินในครอบครัวและการเดินทางด้วยรถยนต์ไฟฟ้าง่ายขึ้นในทุก ๆ วัน
