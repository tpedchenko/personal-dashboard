#!/bin/bash
# Nightly pd-assistant training pipeline
# Run via cron: 0 0 * * * /Users/taras/Documents/taras-code/pd/ml-training/train-nightly.sh

set -e
TRAINING_DIR="/Users/taras/Documents/taras-code/pd/ml-training"
LOG="$TRAINING_DIR/training.log"
MINI="mini"  # SSH alias

echo "$(date): Starting nightly training" >> "$LOG"

# Phase 1: Export fresh data
echo "$(date): Exporting data..." >> "$LOG"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,type,account,category,amount_eur,currency_original,description,sub_type FROM transactions WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/transactions.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,level,mood_delta,energy_level,stress_level,focus_quality,kids_hours,sex_count,bj_count,alcohol,caffeine FROM daily_log WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/daily_logs.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,steps,resting_hr,avg_hr,max_hr,avg_stress,body_battery_high,body_battery_low,sleep_score,intensity_minutes,fitness_age,vo2max_running,training_readiness_score,hrv_last_night,calories_total,calories_active,floors_up FROM garmin_daily WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/garmin.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,sleep_score,duration_seconds,deep_seconds,light_seconds,rem_seconds,awake_seconds,avg_respiration,avg_spo2,avg_hr,lowest_hr,highest_hr,hrv_sleep,body_battery_change FROM garmin_sleep WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/garmin_sleep.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,weight,bmi,body_fat_pct,muscle_mass,bone_mass,body_water_pct,metabolic_age,visceral_fat FROM garmin_body_composition WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/body_composition.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,activity_type,activity_name,duration_seconds,distance_m,calories,avg_hr,max_hr,training_effect_aerobic,training_effect_anaerobic,avg_speed,elevation_gain FROM garmin_activities WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/garmin_activities.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT symbol,name,quantity,avg_cost,market_price,market_value,unrealized_pnl,realized_pnl,currency,asset_class,broker FROM broker_positions WHERE user_id=1 ORDER BY symbol) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/investments.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT date,total_nav,total_pnl,cash_eur,invested_eur FROM portfolio_snapshots WHERE user_id=1 ORDER BY date DESC) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/portfolio.csv"
ssh $MINI 'docker exec pg psql -U pd -d pd_prod -c "COPY (SELECT page,period,insights_json,prompt_used,model FROM ai_insights WHERE user_id=1) TO STDOUT WITH CSV HEADER"' > "$TRAINING_DIR/reference_insights.csv"

# Phase 2: Prepare training data
echo "$(date): Preparing training data..." >> "$LOG"
python3 "$TRAINING_DIR/prepare_training.py" >> "$LOG" 2>&1

# Phase 3: Train
echo "$(date): Starting MLX LoRA training..." >> "$LOG"
python3 -m mlx_lm lora \
  --model mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --train \
  --data "$TRAINING_DIR" \
  --adapter-path "$TRAINING_DIR/adapters" \
  --iters 300 \
  --batch-size 2 \
  --num-layers 12 \
  --learning-rate 1e-5 \
  >> "$LOG" 2>&1

# Phase 4: Fuse
echo "$(date): Fusing adapters..." >> "$LOG"
python3 -m mlx_lm fuse \
  --model mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --adapter-path "$TRAINING_DIR/adapters" \
  --save-path "$TRAINING_DIR/fused-model" \
  >> "$LOG" 2>&1

# Phase 5: Create Ollama model + deploy to mini
echo "$(date): Deploying to mini..." >> "$LOG"
# Create Modelfile pointing to system prompt
scp "$TRAINING_DIR/Modelfile" $MINI:/opt/docker/pd-modelfile
ssh $MINI 'docker cp /opt/docker/pd-modelfile ollama:/tmp/Modelfile && docker exec ollama ollama create pd-assistant -f /tmp/Modelfile' >> "$LOG" 2>&1

echo "$(date): Training complete!" >> "$LOG"

# Phase 6: Notify via Telegram (if bot configured)
TRAIN_EXAMPLES=$(wc -l < "$TRAINING_DIR/train.jsonl" | tr -d ' ')
FINAL_LOSS=$(grep "Train loss" "$LOG" | tail -1 | grep -oP 'Train loss [\d.]+' || echo "unknown")
ssh $MINI "curl -s -X POST 'https://api.telegram.org/bot\$(grep TELEGRAM_BOT_TOKEN /opt/docker/secrets/.pd-prod.env | cut -d= -f2)/sendMessage' -d 'chat_id=${TELEGRAM_CHAT_ID}&text=🤖 Training complete: ${TRAIN_EXAMPLES} examples, ${FINAL_LOSS}&parse_mode=Markdown'" >> "$LOG" 2>&1
