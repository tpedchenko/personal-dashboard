-- ============================================================================
-- seed-demo-data.sql
-- Populate demo data for user_id = 748 (Alex)
-- Covers 5 years: 2021-03-15 to 2026-03-15
-- Safe to run multiple times (deletes demo user data first)
-- ============================================================================

-- ============================================================================
-- 0. CLEANUP: Remove all existing demo user data
-- ============================================================================
DELETE FROM gym_sets WHERE user_id = 748;
DELETE FROM gym_workout_exercises WHERE user_id = 748;
DELETE FROM gym_workouts WHERE user_id = 748;
DELETE FROM gym_program_exercises WHERE user_id = 748;
DELETE FROM gym_program_days WHERE user_id = 748;
DELETE FROM gym_programs WHERE user_id = 748;
DELETE FROM gym_exercises WHERE user_id = 748;
DELETE FROM transactions WHERE user_id = 748;
DELETE FROM custom_accounts WHERE user_id = 748;
DELETE FROM custom_categories WHERE user_id = 748;
DELETE FROM category_favourites WHERE user_id = 748;
DELETE FROM budgets WHERE user_id = 748;
DELETE FROM budget_config WHERE user_id = 748;
DELETE FROM mandatory_categories WHERE user_id = 748;
DELETE FROM recurring_transactions WHERE user_id = 748;
DELETE FROM savings_goals WHERE user_id = 748;
DELETE FROM daily_log WHERE user_id = 748;
DELETE FROM shopping_items WHERE user_id = 748;
DELETE FROM shopping_history WHERE user_id = 748;
DELETE FROM garmin_daily WHERE user_id = 748;
DELETE FROM garmin_sleep WHERE user_id = 748;
DELETE FROM garmin_body_composition WHERE user_id = 748;
DELETE FROM withings_measurements WHERE user_id = 748;
DELETE FROM ai_notes WHERE user_id = 748;
DELETE FROM food_log WHERE user_id = 748;

-- ============================================================================
-- 1. CUSTOM ACCOUNTS
-- ============================================================================
INSERT INTO custom_accounts (name, currency, is_active, sort_order, initial_balance, user_id)
VALUES
  ('Alex ING',      '€', 1, 1, 500,  748),
  ('Alex Revolut',  '€', 1, 2, 100,  748),
  ('Alex Cash',     '€', 1, 3, 50,   748),
  ('Partner N26',   '€', 1, 4, 200,  748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. CUSTOM CATEGORIES (expense categories for demo user)
-- ============================================================================
INSERT INTO custom_categories (category, user_id)
VALUES
  ('Rent', 748),
  ('Groceries', 748),
  ('Restaurants', 748),
  ('Transport', 748),
  ('Utilities', 748),
  ('Entertainment', 748),
  ('Healthcare', 748),
  ('Clothing', 748),
  ('Subscriptions', 748),
  ('Travel', 748),
  ('Salary', 748),
  ('Freelance', 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. TRANSACTIONS (~10,000+ records over 5 years)
-- ============================================================================
DO $$
DECLARE
  d DATE;
  m_start DATE := '2021-03-01';
  m_end DATE := '2026-03-01';
  cur_month DATE;
  progress FLOAT;          -- 0.0 to 1.0 over 5 years
  total_months INT;
  month_idx INT;
  -- base amounts (start -> end)
  salary_base FLOAT;
  rent_base FLOAT;
  groceries_base FLOAT;
  restaurants_base FLOAT;
  transport_base FLOAT;
  utilities_base FLOAT;
  entertainment_base FLOAT;
  healthcare_base FLOAT;
  clothing_base FLOAT;
  subscriptions_base FLOAT;
  -- variation
  var FLOAT;
  rand_day INT;
  rand_val FLOAT;
  -- accounts
  main_accounts TEXT[] := ARRAY['Alex ING', 'Alex Revolut'];
  expense_account TEXT;
  i INT;
  ex_count INT;
  sub_amount FLOAT;
BEGIN
  total_months := (EXTRACT(YEAR FROM m_end) - EXTRACT(YEAR FROM m_start)) * 12
                + (EXTRACT(MONTH FROM m_end) - EXTRACT(MONTH FROM m_start));

  cur_month := m_start;
  month_idx := 0;

  WHILE cur_month <= m_end LOOP
    progress := month_idx::FLOAT / GREATEST(total_months, 1);

    -- Salary: 400 -> 5000 (exponential-ish growth)
    salary_base := 400 + (5000 - 400) * power(progress, 0.7);
    -- Rent: 800 -> 1000
    rent_base := 800 + (1000 - 800) * progress;
    -- Groceries: 150 -> 400
    groceries_base := 150 + (400 - 150) * progress;
    -- Restaurants: 30 -> 150
    restaurants_base := 30 + (150 - 30) * progress;
    -- Transport: 40 -> 80
    transport_base := 40 + (80 - 40) * progress;
    -- Utilities: 50 -> 100
    utilities_base := 50 + (100 - 50) * progress;
    -- Entertainment: 20 -> 80
    entertainment_base := 20 + (80 - 20) * progress;
    -- Healthcare: 20 -> 50
    healthcare_base := 20 + (50 - 20) * progress;
    -- Clothing: 30 -> 80
    clothing_base := 30 + (80 - 30) * progress;
    -- Subscriptions: 15 -> 50
    subscriptions_base := 15 + (50 - 15) * progress;

    -- ====== INCOME: Salary (1st of month) ======
    var := 1.0 + (random() - 0.5) * 0.06;  -- +/- 3% for salary
    INSERT INTO transactions (date, year, month, type, sub_type, account, category,
      amount_original, currency_original, amount_eur, description, source, user_id)
    VALUES (
      (cur_month + INTERVAL '0 days')::TEXT,
      EXTRACT(YEAR FROM cur_month)::INT,
      EXTRACT(MONTH FROM cur_month)::INT,
      'INCOME', NULL, 'Alex ING', 'Salary',
      ROUND((salary_base * var)::NUMERIC, 2),
      '€',
      ROUND((salary_base * var)::NUMERIC, 2),
      'Monthly salary - TechCorp',
      'manual', 748
    );

    -- ====== INCOME: Freelance (occasional, ~30% chance) ======
    IF random() < 0.3 THEN
      rand_day := 10 + floor(random() * 18)::INT;
      rand_val := (100 + random() * 900) * (0.5 + progress);
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'INCOME', NULL, 'Alex Revolut', 'Freelance',
        ROUND(rand_val::NUMERIC, 2),
        '€',
        ROUND(rand_val::NUMERIC, 2),
        'Freelance project payment',
        'manual', 748
      );
    END IF;

    -- ====== EXPENSE: Rent (1st of month) ======
    var := 1.0;
    INSERT INTO transactions (date, year, month, type, sub_type, account, category,
      amount_original, currency_original, amount_eur, description, source, user_id)
    VALUES (
      (cur_month + INTERVAL '0 days')::TEXT,
      EXTRACT(YEAR FROM cur_month)::INT,
      EXTRACT(MONTH FROM cur_month)::INT,
      'EXPENSE', NULL, 'Alex ING', 'Rent',
      ROUND((rent_base)::NUMERIC, 2),
      '€',
      ROUND((rent_base)::NUMERIC, 2),
      'Apartment rent',
      'manual', 748
    );

    -- ====== EXPENSE: Groceries (6-12 transactions per month) ======
    ex_count := 6 + floor(random() * 7)::INT;
    FOR i IN 1..ex_count LOOP
      rand_day := floor(random() * 28)::INT;
      sub_amount := (groceries_base / ex_count) * (0.5 + random());
      expense_account := main_accounts[1 + floor(random() * 2)::INT];
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, expense_account, 'Groceries',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['Albert Heijn', 'Lidl', 'Jumbo', 'Aldi', 'PLUS', 'Dirk'])[1 + floor(random() * 6)::INT],
        'manual', 748
      );
    END LOOP;

    -- ====== EXPENSE: Restaurants (2-5 per month) ======
    ex_count := 2 + floor(random() * 4)::INT;
    FOR i IN 1..ex_count LOOP
      rand_day := floor(random() * 28)::INT;
      sub_amount := (restaurants_base / ex_count) * (0.6 + random() * 0.8);
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex Revolut', 'Restaurants',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['Pizza place', 'Sushi bar', 'Thai takeaway', 'Burger joint', 'Indian restaurant', 'Cafe brunch'])[1 + floor(random() * 6)::INT],
        'manual', 748
      );
    END LOOP;

    -- ====== EXPENSE: Transport (2-4 per month) ======
    ex_count := 2 + floor(random() * 3)::INT;
    FOR i IN 1..ex_count LOOP
      rand_day := floor(random() * 28)::INT;
      sub_amount := (transport_base / ex_count) * (0.7 + random() * 0.6);
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex ING', 'Transport',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['NS train ticket', 'OV-chipkaart top-up', 'Uber ride', 'Fuel', 'Parking'])[1 + floor(random() * 5)::INT],
        'manual', 748
      );
    END LOOP;

    -- ====== EXPENSE: Utilities (1 per month) ======
    var := 1.0 + (random() - 0.5) * 0.2;
    INSERT INTO transactions (date, year, month, type, sub_type, account, category,
      amount_original, currency_original, amount_eur, description, source, user_id)
    VALUES (
      (cur_month + INTERVAL '4 days')::TEXT,
      EXTRACT(YEAR FROM cur_month)::INT,
      EXTRACT(MONTH FROM cur_month)::INT,
      'EXPENSE', NULL, 'Alex ING', 'Utilities',
      ROUND((utilities_base * var)::NUMERIC, 2),
      '€',
      ROUND((utilities_base * var)::NUMERIC, 2),
      'Electricity + Gas + Water',
      'manual', 748
    );

    -- ====== EXPENSE: Entertainment (1-3 per month) ======
    ex_count := 1 + floor(random() * 3)::INT;
    FOR i IN 1..ex_count LOOP
      rand_day := floor(random() * 28)::INT;
      sub_amount := (entertainment_base / ex_count) * (0.6 + random() * 0.8);
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex Revolut', 'Entertainment',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['Cinema tickets', 'Concert', 'Board games', 'Bowling', 'Museum visit', 'Escape room'])[1 + floor(random() * 6)::INT],
        'manual', 748
      );
    END LOOP;

    -- ====== EXPENSE: Healthcare (0-2 per month) ======
    ex_count := floor(random() * 3)::INT;
    FOR i IN 1..ex_count LOOP
      rand_day := floor(random() * 28)::INT;
      sub_amount := healthcare_base * (0.5 + random());
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex ING', 'Healthcare',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['Pharmacy', 'Doctor visit', 'Dentist', 'Vitamins', 'Health insurance copay'])[1 + floor(random() * 5)::INT],
        'manual', 748
      );
    END LOOP;

    -- ====== EXPENSE: Clothing (0-2 per month) ======
    IF random() < 0.6 THEN
      rand_day := floor(random() * 28)::INT;
      sub_amount := clothing_base * (0.5 + random());
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex Revolut', 'Clothing',
        ROUND(sub_amount::NUMERIC, 2),
        '€',
        ROUND(sub_amount::NUMERIC, 2),
        (ARRAY['H&M', 'Zara', 'UNIQLO', 'Decathlon', 'Online order', 'Thrift store'])[1 + floor(random() * 6)::INT],
        'manual', 748
      );
    END IF;

    -- ====== EXPENSE: Subscriptions (1 per month) ======
    INSERT INTO transactions (date, year, month, type, sub_type, account, category,
      amount_original, currency_original, amount_eur, description, source, user_id)
    VALUES (
      (cur_month + INTERVAL '2 days')::TEXT,
      EXTRACT(YEAR FROM cur_month)::INT,
      EXTRACT(MONTH FROM cur_month)::INT,
      'EXPENSE', NULL, 'Alex ING', 'Subscriptions',
      ROUND(subscriptions_base::NUMERIC, 2),
      '€',
      ROUND(subscriptions_base::NUMERIC, 2),
      'Netflix + Spotify + iCloud',
      'manual', 748
    );

    -- ====== EXPENSE: Travel (occasional, ~15% chance, seasonal bias) ======
    IF random() < 0.15
       OR (EXTRACT(MONTH FROM cur_month) IN (6,7,8,12) AND random() < 0.35) THEN
      rand_day := floor(random() * 20)::INT + 5;
      rand_val := 200 + random() * 1300;
      INSERT INTO transactions (date, year, month, type, sub_type, account, category,
        amount_original, currency_original, amount_eur, description, source, user_id)
      VALUES (
        (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
        EXTRACT(YEAR FROM cur_month)::INT,
        EXTRACT(MONTH FROM cur_month)::INT,
        'EXPENSE', NULL, 'Alex Revolut', 'Travel',
        ROUND(rand_val::NUMERIC, 2),
        '€',
        ROUND(rand_val::NUMERIC, 2),
        (ARRAY['Flight tickets', 'Airbnb booking', 'Hotel stay', 'Train trip', 'Car rental', 'Travel insurance'])[1 + floor(random() * 6)::INT],
        'manual', 748
      );
    END IF;

    -- ====== Partner expenses (from Partner N26 account, ~40% of months) ======
    IF random() < 0.4 THEN
      ex_count := 1 + floor(random() * 3)::INT;
      FOR i IN 1..ex_count LOOP
        rand_day := floor(random() * 28)::INT;
        sub_amount := 20 + random() * 120;
        INSERT INTO transactions (date, year, month, type, sub_type, account, category,
          amount_original, currency_original, amount_eur, description, source, user_id)
        VALUES (
          (cur_month + (rand_day || ' days')::INTERVAL)::DATE::TEXT,
          EXTRACT(YEAR FROM cur_month)::INT,
          EXTRACT(MONTH FROM cur_month)::INT,
          'EXPENSE', NULL, 'Partner N26',
          (ARRAY['Groceries', 'Restaurants', 'Entertainment', 'Healthcare'])[1 + floor(random() * 4)::INT],
          ROUND(sub_amount::NUMERIC, 2),
          '€',
          ROUND(sub_amount::NUMERIC, 2),
          'Partner expense',
          'manual', 748
        );
      END LOOP;
    END IF;

    cur_month := cur_month + INTERVAL '1 month';
    month_idx := month_idx + 1;
  END LOOP;

  RAISE NOTICE 'Transactions generated: % months processed', month_idx;
END $$;

-- ============================================================================
-- 4. BUDGETS
-- ============================================================================
INSERT INTO budgets (category, amount_eur, month, active, user_id)
VALUES
  ('Groceries',     400, NULL, 1, 748),
  ('Restaurants',   150, NULL, 1, 748),
  ('Entertainment',  80, NULL, 1, 748),
  ('Transport',      80, NULL, 1, 748),
  ('Clothing',       80, NULL, 1, 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. BUDGET CONFIG
-- ============================================================================
INSERT INTO budget_config (user_id, limit_type, limit_value)
VALUES (748, 'fixed', 2000)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. MANDATORY CATEGORIES
-- ============================================================================
INSERT INTO mandatory_categories (user_id, category)
VALUES
  (748, 'Rent'),
  (748, 'Utilities'),
  (748, 'Subscriptions')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. RECURRING TRANSACTIONS
-- ============================================================================
INSERT INTO recurring_transactions (name, amount_eur, category, tx_type, account, day_of_month, active, user_id)
VALUES
  ('Apartment rent',     1000, 'Rent',          'EXPENSE', 'Alex ING', 1, 1, 748),
  ('Utilities',           100, 'Utilities',     'EXPENSE', 'Alex ING', 5, 1, 748),
  ('Subscriptions',        50, 'Subscriptions', 'EXPENSE', 'Alex ING', 3, 1, 748),
  ('Salary',             5000, 'Salary',        'INCOME',  'Alex ING', 1, 1, 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. SAVINGS GOALS
-- ============================================================================
INSERT INTO savings_goals (name, target_eur, current_eur, deadline, active, user_id)
VALUES
  ('Emergency fund',  10000, 6500, '2026-12-31', 1, 748),
  ('Vacation fund',    3000, 1200, '2026-08-01', 1, 748),
  ('New laptop',       2000,  800, '2026-06-01', 1, 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. DAILY LOG (~1800 records)
-- ============================================================================
DO $$
DECLARE
  d DATE;
  level_val FLOAT := 0;
  mood_val INT;
  energy_val INT;
  stress_val INT;
  focus_val INT;
  alcohol_val INT;
  caffeine_val INT;
  kids_val FLOAT;
  day_of_week INT;
BEGIN
  FOR d IN SELECT generate_series('2021-03-15'::DATE, '2026-03-15'::DATE, '1 day')::DATE LOOP
    -- Skip ~10% of days
    IF random() < 0.10 THEN
      CONTINUE;
    END IF;

    day_of_week := EXTRACT(DOW FROM d)::INT;  -- 0=Sun, 6=Sat

    -- Level: random walk between -3 and +3
    level_val := level_val + (random() - 0.5) * 1.2;
    level_val := GREATEST(-3, LEAST(3, level_val));
    -- Slight positive bias on weekends
    IF day_of_week IN (0, 6) THEN
      level_val := level_val + 0.1;
      level_val := LEAST(3, level_val);
    END IF;

    -- Mood delta: -3 to 3
    mood_val := floor(random() * 7 - 3)::INT;

    -- Energy: 1-5 (weekdays slightly lower)
    energy_val := CASE WHEN day_of_week IN (0, 6)
      THEN 2 + floor(random() * 4)::INT
      ELSE 1 + floor(random() * 4)::INT
    END;
    energy_val := GREATEST(1, LEAST(5, energy_val));

    -- Stress: 1-5
    stress_val := CASE WHEN day_of_week IN (0, 6)
      THEN 1 + floor(random() * 3)::INT
      ELSE 1 + floor(random() * 5)::INT
    END;
    stress_val := GREATEST(1, LEAST(5, stress_val));

    -- Focus: 1-5
    focus_val := 2 + floor(random() * 4)::INT;
    focus_val := GREATEST(1, LEAST(5, focus_val));

    -- Alcohol: 0 or 1, mostly weekends
    alcohol_val := CASE
      WHEN day_of_week IN (5, 6) AND random() < 0.5 THEN 1
      WHEN random() < 0.1 THEN 1
      ELSE 0
    END;

    -- Caffeine: 1-3
    caffeine_val := 1 + floor(random() * 3)::INT;

    -- Kids hours: 0-4, only after 2023
    kids_val := CASE
      WHEN d >= '2023-01-01' THEN ROUND((random() * 4)::NUMERIC, 1)
      ELSE NULL
    END;

    INSERT INTO daily_log (date, level, mood_delta, energy_level, stress_level,
      focus_quality, alcohol, caffeine, kids_hours, user_id)
    VALUES (
      d::TEXT,
      ROUND(level_val::NUMERIC, 2),
      mood_val,
      energy_val,
      stress_val,
      focus_val,
      alcohol_val,
      caffeine_val,
      kids_val,
      748
    )
    ON CONFLICT (user_id, date) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Daily log records generated for demo user';
END $$;

-- ============================================================================
-- 10. COPY GYM EXERCISES FROM TARAS (user_id = 1)
-- ============================================================================
INSERT INTO gym_exercises (user_id, name, muscle_group, secondary_muscles,
  equipment, exercise_type, force_type, level, description, is_custom,
  recovery_hours, name_ua, is_favourite)
SELECT
  748, name, muscle_group, secondary_muscles,
  equipment, exercise_type, force_type, level, description, is_custom,
  recovery_hours, name_ua, is_favourite
FROM gym_exercises
WHERE user_id = 1
ON CONFLICT (user_id, name) DO NOTHING;

-- ============================================================================
-- 11. GYM WORKOUTS (~500 records, 3-4 times per week over 5 years)
-- ============================================================================
DO $$
DECLARE
  d DATE;
  workout_id INT;
  exercise_ids INT[];
  chosen_exercises INT[];
  we_id INT;
  num_exercises INT;
  num_sets INT;
  base_weight FLOAT;
  weight_progress FLOAT;
  workout_day_of_week INT;
  i INT;
  j INT;
  workout_count INT := 0;
  workout_names TEXT[] := ARRAY['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Lower Body', 'Full Body'];
  program_types TEXT[] := ARRAY['PPL', 'Upper/Lower', 'Full Body'];
BEGIN
  -- Get exercise IDs for demo user
  SELECT array_agg(id) INTO exercise_ids
  FROM gym_exercises
  WHERE user_id = 748;

  -- If no exercises were copied, skip
  IF exercise_ids IS NULL OR array_length(exercise_ids, 1) IS NULL THEN
    RAISE NOTICE 'No gym exercises found for user 748, skipping workouts';
    RETURN;
  END IF;

  FOR d IN SELECT generate_series('2021-03-15'::DATE, '2026-03-15'::DATE, '1 day')::DATE LOOP
    workout_day_of_week := EXTRACT(DOW FROM d)::INT;

    -- Train Mon(1), Wed(3), Fri(5), and sometimes Sat(6)
    IF workout_day_of_week NOT IN (1, 3, 5) THEN
      IF workout_day_of_week = 6 AND random() < 0.3 THEN
        NULL; -- proceed with Saturday workout
      ELSE
        CONTINUE;
      END IF;
    END IF;

    -- Skip ~8% of training days (rest, sick, etc.)
    IF random() < 0.08 THEN
      CONTINUE;
    END IF;

    -- Weight progress factor (0 -> 1 over 5 years)
    weight_progress := (d - '2021-03-15'::DATE)::FLOAT / (365.25 * 5);

    -- Create workout
    INSERT INTO gym_workouts (user_id, date, start_time, end_time, program_type,
      workout_name, duration_minutes)
    VALUES (
      748,
      d::TEXT,
      (CASE WHEN random() < 0.5 THEN '07:' ELSE '18:' END || LPAD((floor(random() * 60)::INT)::TEXT, 2, '0')),
      NULL,
      program_types[1 + floor(random() * array_length(program_types, 1))::INT],
      workout_names[1 + floor(random() * array_length(workout_names, 1))::INT],
      45 + floor(random() * 45)::INT
    )
    RETURNING id INTO workout_id;

    -- 4-6 exercises per workout
    num_exercises := 4 + floor(random() * 3)::INT;
    num_exercises := LEAST(num_exercises, array_length(exercise_ids, 1));

    -- Pick random exercises (simple shuffle pick)
    chosen_exercises := ARRAY[]::INT[];
    WHILE array_length(chosen_exercises, 1) IS NULL
          OR array_length(chosen_exercises, 1) < num_exercises LOOP
      i := exercise_ids[1 + floor(random() * array_length(exercise_ids, 1))::INT];
      IF NOT (i = ANY(chosen_exercises)) THEN
        chosen_exercises := chosen_exercises || i;
      END IF;
    END LOOP;

    FOR i IN 1..num_exercises LOOP
      -- Create workout exercise
      INSERT INTO gym_workout_exercises (user_id, workout_id, exercise_id, order_num)
      VALUES (748, workout_id, chosen_exercises[i], i)
      RETURNING id INTO we_id;

      -- 3-4 sets per exercise
      num_sets := 3 + floor(random() * 2)::INT;
      -- Base weight increases with progress
      base_weight := 10 + random() * 30 + weight_progress * 40;

      FOR j IN 1..num_sets LOOP
        INSERT INTO gym_sets (user_id, workout_exercise_id, set_num, weight_kg, reps,
          is_warmup, is_failure, rest_seconds, intensity)
        VALUES (
          748,
          we_id,
          j,
          ROUND((base_weight * (0.9 + random() * 0.2))::NUMERIC, 1),
          8 + floor(random() * 5)::INT,
          CASE WHEN j = 1 AND random() < 0.3 THEN 1 ELSE 0 END,
          CASE WHEN j = num_sets AND random() < 0.15 THEN 1 ELSE 0 END,
          60 + floor(random() * 120)::INT,
          CASE WHEN random() < 0.7 THEN 'normal' ELSE 'high' END
        );
      END LOOP;
    END LOOP;

    workout_count := workout_count + 1;
  END LOOP;

  RAISE NOTICE 'Gym workouts generated: %', workout_count;
END $$;

-- ============================================================================
-- 12. COPY GARMIN DAILY DATA FROM TARAS
-- ============================================================================
INSERT INTO garmin_daily (date, steps, calories_total, calories_active, distance_m,
  floors_up, floors_down, intensity_minutes, resting_hr, avg_hr, max_hr,
  avg_stress, max_stress, body_battery_high, body_battery_low,
  sleep_seconds, sleep_score, spo2_avg, respiration_avg,
  hrv_weekly_avg, hrv_last_night, hrv_status,
  training_readiness_score, training_status, training_load, user_id)
SELECT date, steps, calories_total, calories_active, distance_m,
  floors_up, floors_down, intensity_minutes, resting_hr, avg_hr, max_hr,
  avg_stress, max_stress, body_battery_high, body_battery_low,
  sleep_seconds, sleep_score, spo2_avg, respiration_avg,
  hrv_weekly_avg, hrv_last_night, hrv_status,
  training_readiness_score, training_status, training_load, 748
FROM garmin_daily
WHERE user_id = 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 13. COPY GARMIN SLEEP DATA FROM TARAS
-- ============================================================================
INSERT INTO garmin_sleep (date, sleep_start, sleep_end, duration_seconds,
  deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, user_id)
SELECT date, sleep_start, sleep_end, duration_seconds,
  deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, 748
FROM garmin_sleep
WHERE user_id = 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 14. COPY GARMIN BODY COMPOSITION FROM TARAS
-- ============================================================================
INSERT INTO garmin_body_composition (date, weight, bmi, body_fat_pct, muscle_mass,
  bone_mass, body_water_pct, physique_rating, metabolic_age, visceral_fat, user_id)
SELECT date, weight, bmi, body_fat_pct, muscle_mass,
  bone_mass, body_water_pct, physique_rating, metabolic_age, visceral_fat, 748
FROM garmin_body_composition
WHERE user_id = 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 15. COPY WITHINGS MEASUREMENTS FROM TARAS
-- ============================================================================
INSERT INTO withings_measurements (date, weight, fat_ratio, fat_mass,
  fat_free_mass, heart_rate, bmi, user_id)
SELECT date, weight, fat_ratio, fat_mass,
  fat_free_mass, heart_rate, bmi, 748
FROM withings_measurements
WHERE user_id = 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 16. SHOPPING ITEMS (active + some bought)
-- ============================================================================
INSERT INTO shopping_items (item_name, quantity, added_by, bought_at, bought_by, user_id)
VALUES
  ('Milk 1L',           '2',  'app', NULL, NULL, 748),
  ('Whole wheat bread',  '1',  'app', NULL, NULL, 748),
  ('Eggs (10 pack)',    '1',  'app', NULL, NULL, 748),
  ('Chicken breast',    '500g', 'app', NULL, NULL, 748),
  ('Bananas',           '6',  'app', NULL, NULL, 748),
  ('Olive oil',         '1',  'app', NULL, NULL, 748),
  ('Rice 1kg',          '1',  'app', NULL, NULL, 748),
  ('Greek yogurt',      '3',  'app', NULL, NULL, 748),
  ('Tomatoes',          '1kg', 'app', NULL, NULL, 748),
  ('Onions',            '1kg', 'app', NULL, NULL, 748),
  ('Pasta',             '2',  'app', NULL, NULL, 748),
  ('Cheddar cheese',    '200g','app', NULL, NULL, 748),
  ('Orange juice',      '1L', 'app', NULL, NULL, 748),
  ('Frozen veggies',    '1',  'app', NULL, NULL, 748),
  ('Coffee beans',      '500g','app', NULL, NULL, 748),
  ('Butter',            '1',  'app', NULL, NULL, 748),
  ('Garlic',            '3',  'app', NULL, NULL, 748),
  ('Dish soap',         '1',  'app', NOW(), 'Alex', 748),
  ('Paper towels',      '2',  'app', NOW(), 'Alex', 748),
  ('Laundry detergent', '1',  'app', NOW(), 'Alex', 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 17. CATEGORY FAVOURITES
-- ============================================================================
INSERT INTO category_favourites (category, user_id)
VALUES
  ('Groceries', 748),
  ('Restaurants', 748),
  ('Transport', 748),
  ('Salary', 748)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Done!
-- ============================================================================
DO $$
DECLARE
  tx_count INT;
  daily_count INT;
  workout_count INT;
BEGIN
  SELECT COUNT(*) INTO tx_count FROM transactions WHERE user_id = 748;
  SELECT COUNT(*) INTO daily_count FROM daily_log WHERE user_id = 748;
  SELECT COUNT(*) INTO workout_count FROM gym_workouts WHERE user_id = 748;
  RAISE NOTICE '=== DEMO DATA SEED COMPLETE ===';
  RAISE NOTICE 'Transactions: %', tx_count;
  RAISE NOTICE 'Daily log entries: %', daily_count;
  RAISE NOTICE 'Gym workouts: %', workout_count;
  RAISE NOTICE 'User ID: 748';
END $$;
