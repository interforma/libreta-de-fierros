-- Datos iniciales por usuario: catálogo de máquinas y rutinas de Sergio.
-- La app llama a seed_defaults() al iniciar sesión; solo inserta lo que falta.
create or replace function public.seed_defaults() returns void
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.machines (user_id, slug, name, muscle_group, how_to) values
    (uid,'press_pecho','Press de pecho máquina','Pecho · Tríceps','Sentado, manillas a la altura del pecho. Empuja hacia adelante sin bloquear los codos y vuelve controlado.'),
    (uid,'jalon_pecho','Jalón al pecho','Espalda · Bíceps','Barra ancha, muslos trabados bajo el rodillo. Baja la barra hacia la parte alta del pecho llevando los codos hacia abajo.'),
    (uid,'press_hombros','Press de hombros máquina','Hombros · Tríceps','Sentado, manillas a la altura de los hombros. Empuja hacia arriba sin arquear la espalda.'),
    (uid,'remo_polea','Remo sentado polea','Espalda · Bíceps','Pies apoyados, espalda recta. Tira del agarre hacia el abdomen juntando los omóplatos.'),
    (uid,'curl_biceps','Curl de bíceps','Bíceps','En máquina o polea baja con barra. Codos fijos, sube flexionando y baja lento.'),
    (uid,'triceps_polea','Extensión de tríceps polea','Tríceps','De pie frente a la polea alta, codos pegados al cuerpo. Empuja la cuerda o barra hacia abajo.'),
    (uid,'press_inclinado','Press inclinado máquina','Pecho · Hombros','Como el press de pecho pero en diagonal hacia arriba. Enfoca la parte alta del pecho.'),
    (uid,'remo_apoyo','Remo con apoyo en pecho','Espalda · Bíceps','Pecho apoyado en el cojín, tira de las manillas hacia atrás. Protege la zona lumbar.'),
    (uid,'pec_deck','Aperturas pec deck','Pecho','Sentado, codos levemente flexionados. Cierra los brazos al frente como abrazando un árbol.'),
    (uid,'jalon_cerrado','Jalón agarre cerrado','Espalda · Bíceps','Misma máquina de jalón con agarre en V (triángulo). Baja hacia el pecho con los codos pegados.'),
    (uid,'elev_laterales','Elevaciones laterales','Hombros','Levanta los brazos hacia los costados hasta la altura de los hombros. Alternativa: polea baja.'),
    (uid,'face_pull','Face pull polea','Hombros · Espalda','Polea alta con cuerda. Tira hacia la cara con los codos altos, abriendo la cuerda. Bueno para la postura.'),
    (uid,'prensa','Prensa de piernas','Cuádriceps · Glúteos','Pies al ancho de caderas. Empuja sin bloquear las rodillas.'),
    (uid,'ext_cuadriceps','Extensión de cuádriceps','Cuádriceps','Sentado, rodillo en los tobillos. Estira las piernas y baja controlado.'),
    (uid,'curl_femoral','Curl femoral','Isquiotibiales','Sentado o acostado. Flexiona las rodillas llevando el rodillo hacia los glúteos.'),
    (uid,'aductores','Aductores','Aductores','Sentado, cojines por dentro de las rodillas. Cierra las piernas. Suele ser la misma máquina de abductores.'),
    (uid,'pantorrillas_pie','Pantorrillas de pie','Pantorrillas','De pie o en la prensa. Sube en puntas y baja estirando.'),
    (uid,'plancha','Plancha','Core','Antebrazos y puntas de pies, cuerpo en línea recta de cabeza a talones.'),
    (uid,'smith','Sentadilla Smith / hack','Cuádriceps · Glúteos','Smith: barra guiada en rieles. Hack: máquina inclinada con apoyo en la espalda. Alternativa: prensa con pies altos.'),
    (uid,'zancadas','Zancadas / subida a cajón','Cuádriceps · Glúteos','Cajón o banco firme; apóyate en una barra si necesitas equilibrio. Anota el peso de cada mancuerna (0 sin peso).'),
    (uid,'abductores','Abductores','Abductores · Glúteos','Sentado, cojines por fuera de las rodillas. Abre las piernas.'),
    (uid,'pantorrillas_sentado','Pantorrillas sentado','Pantorrillas','Sentado, cojines sobre las rodillas. Sube talones y baja estirando.'),
    (uid,'crunch','Crunch máquina / polea','Core','Dobla el tronco hacia adelante contra la resistencia usando el abdomen, no los brazos.'),
    (uid,'cinta','Cinta de correr','Cardio','Caminata rápida o trote suave con algo de inclinación. Ritmo conversacional.'),
    (uid,'bici','Bicicleta estática','Cardio','Vertical o reclinada. Sirve para calentamiento y cardio final.'),
    (uid,'remo_ergo','Remoergómetro','Cardio · Espalda','El empuje sale de las piernas, luego tronco y brazos.'),
    (uid,'plancha_lateral','Plancha lateral','Core','Apoyo en un antebrazo, cadera arriba alineada con hombros y pies. Haz cada lado.'),
    (uid,'puente','Puente de glúteos','Glúteos · Core','Boca arriba, rodillas flexionadas. Sube la cadera apretando glúteos sin arquear la zona lumbar.')
  on conflict (user_id, slug) do nothing;
  insert into public.routines (user_id, slug, name, type, weekdays, duration_min, items, position) values
    (uid,'SA','Tren superior A','fuerza','{1}',75,'[{"m": "bici", "k": "cardio", "min": 10, "label": "Calentamiento", "alt": "bici o remo"}, {"m": "press_pecho", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "jalon_pecho", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "press_hombros", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "remo_polea", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "curl_biceps", "k": "load", "sets": 3, "reps": [10, 12], "rest": 60}, {"m": "triceps_polea", "k": "load", "sets": 3, "reps": [10, 12], "rest": 60}, {"m": "cinta", "k": "cardio", "min": 15, "label": "Cardio final", "alt": "cinta o bici"}]'::jsonb,0),
    (uid,'CC','Cardio suave + core','cardio','{2,5}',50,'[{"m": "bici", "k": "cardio", "min": 5, "label": "Calentamiento", "alt": "cualquier máquina, suave"}, {"m": "cinta", "k": "cardio", "min": 30, "label": "Cardio ritmo conversacional", "alt": "cinta, bici o remo"}, {"m": "plancha", "k": "hold", "sets": 3, "secs": 30, "rest": 15}, {"m": "plancha_lateral", "k": "hold", "sets": 3, "secs": 30, "rest": 15, "per": "por lado"}, {"m": "puente", "k": "hold", "sets": 3, "secs": 30, "rest": 60}]'::jsonb,1),
    (uid,'IB','Tren inferior B','fuerza','{3}',75,'[{"m": "bici", "k": "cardio", "min": 10, "label": "Calentamiento", "alt": "bici o remo"}, {"m": "smith", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "curl_femoral", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "zancadas", "k": "load", "sets": 3, "reps": [10, 10], "rest": 90, "per": "por pierna"}, {"m": "abductores", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "pantorrillas_sentado", "k": "load", "sets": 3, "reps": [15, 15], "rest": 60}, {"m": "crunch", "k": "load", "sets": 3, "reps": [15, 15], "rest": 60}, {"m": "cinta", "k": "cardio", "min": 15, "label": "Cardio final", "alt": "cinta o bici"}]'::jsonb,2),
    (uid,'SB','Tren superior B','fuerza','{4}',75,'[{"m": "bici", "k": "cardio", "min": 10, "label": "Calentamiento", "alt": "bici o remo"}, {"m": "press_inclinado", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "remo_apoyo", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "pec_deck", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "jalon_cerrado", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "elev_laterales", "k": "load", "sets": 3, "reps": [10, 12], "rest": 60}, {"m": "face_pull", "k": "load", "sets": 3, "reps": [10, 12], "rest": 60}, {"m": "cinta", "k": "cardio", "min": 15, "label": "Cardio final", "alt": "cinta o bici"}]'::jsonb,3),
    (uid,'IA','Tren inferior A','fuerza','{6}',75,'[{"m": "bici", "k": "cardio", "min": 10, "label": "Calentamiento", "alt": "bici o remo"}, {"m": "prensa", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "ext_cuadriceps", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "curl_femoral", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "aductores", "k": "load", "sets": 3, "reps": [10, 12], "rest": 90}, {"m": "pantorrillas_pie", "k": "load", "sets": 3, "reps": [15, 15], "rest": 60}, {"m": "plancha", "k": "hold", "sets": 3, "secs": 30, "rest": 60}, {"m": "cinta", "k": "cardio", "min": 15, "label": "Cardio final", "alt": "cinta o bici"}]'::jsonb,4)
  on conflict (user_id, slug) do nothing;
end $$;
revoke all on function public.seed_defaults() from public, anon;
grant execute on function public.seed_defaults() to authenticated;
