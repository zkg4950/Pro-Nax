# ProNax App Control SQL Files

Ye SQL files app control ke liye hain. Supabase SQL Editor mein **ek-ek karke** run karo.

## Run Order (Important!)

1. **01_system_config.sql** - System-wide settings (maintenance mode, site name, etc.)
2. **03_app_settings_proper.sql** - App features & algorithm weights (recreates table with proper structure)
3. **04_feature_flags.sql** - Feature toggles
4. **05_categories.sql** - Video categories
5. **06_sidebar_menu.sql** - Navigation menu

**Note:** `02_app_settings.sql` skip karo, uski jagah `03_app_settings_proper.sql` use karo jo proper structure ke saath hai.

## File Descriptions

### 01_system_config.sql
- **system_config** table ka default data
- Maintenance mode toggle
- Site name, description, colors
- Signup/uploads/ads enable/disable
- Minimum withdrawal amount

### 03_app_settings_proper.sql
- **app_settings** table proper structure ke saath recreate karta hai
- Feature toggles (uploads, live, shorts, comments, ads, wallet, downloads)
- Homepage sections order
- Algorithm weights (category affinity, freshness boost, CTR weight, etc.)

### 04_feature_flags.sql
- **feature_flags** table ka default data
- Feature toggles for controlled rollouts
- Rollout percentages

### 05_categories.sql
- **categories** table ka default data
- Video categories (Music, Gaming, Education, etc.)
- Icons and order

### 06_sidebar_menu.sql
- **sidebar_menu** table ka default data
- Navigation menu items
- Icons and links

## How to Run

1. Supabase Dashboard open karo: https://iouowplbxxivecctuilt.supabase.co
2. **SQL Editor** click karo
3. Pehle `01_system_config.sql` ka content paste karo aur **Run** karo
4. Phir `03_app_settings_proper.sql` paste karo aur **Run** karo
5. Phir `04_feature_flags.sql` paste karo aur **Run** karo
6. Phir `05_categories.sql` paste karo aur **Run** karo
7. Phir `06_sidebar_menu.sql` paste karo aur **Run** karo

**Important:** Har file ko alag-alag run karo, ek saath nahi!
