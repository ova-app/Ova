# rules/database.md

## 11 tables

```
users             : id, email, username, full_name, avatar_url, weight_unit(kg|lbs), plan(free|premium), locale, created_at
follows           : follower_id → users.id, following_id → users.id, created_at
gyms              : id, name, address, lat, lng, is_home, created_by → users.id, created_at
muscles           : id, name, group, body_side
exercises         : id, name_fr, slug, equipment_type, muscle_group, mechanics, force_type,
                    laterality, source, external_id, is_verified, created_by, created_at
exercise_muscles  : exercise_id, muscle_id, role(primary|secondary|stabilizer), activation_pct, source, confidence
workouts          : id, user_id, gym_id, title, started_at, ended_at, duration_sec, total_volume_kg,
                    is_public(DEFAULT false), note, lat, lng, avg_rest_seconds, photo_url, location_city,
                    pr_seance(text NULL — 'gold'|'silver'|'bronze')
workout_exercises : id, workout_id, exercise_id, order_index, note,
                    pr_exercice(text NULL — 'gold'|'silver'|'bronze')
workout_sets      : id, workout_exercise_id, set_type(warmup|working|dropset|failure), set_number,
                    reps, weight_kg, rest_seconds, rpe, is_pr,
                    pr_charge(text NULL — 'gold'|'silver'|'bronze'),
                    pr_serie(text NULL — 'gold'|'silver'|'bronze'),
                    parent_set_id, is_continuation, logged_at
likes             : user_id, workout_id, created_at
comments          : id, workout_id, user_id, content, created_at
```

## Rappels critiques
- Trigger `on_auth_user_created` crée `public.users` automatiquement
- Signaler toute migration SQL avant de coder
