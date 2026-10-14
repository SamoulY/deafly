-- 48 original meme designs and a total 10,000x price multiplier requested by the owner.
-- Fixed values make retries safe. Historical receipts, cash and inventory stay unchanged.
INSERT OR IGNORE INTO room_catalog (id,slot,name,price,resale) VALUES
('head-bull','head','Bullish horns',640000,320000),
('head-foil','head','Tin foil analyst',320000,160000),
('head-moon','head','Moon mission helmet',1200000,600000),
('head-diamond','head','Diamond hands crown',1600000,800000),
('head-capy','head','Capybara bucket hat',480000,240000),
('head-aura','head','Aura farming halo',960000,480000),
('head-mushroom','head','Touch grass mushroom',360000,180000),
('head-67','head','Six seven party hat',420000,210000),
('face-pixel','face','Deal with it shades',400000,200000),
('face-laser','face','Laser focus lenses',880000,440000),
('face-sleep','face','Do not disturb mask',280000,140000),
('face-wow','face','Surprised analyst',340000,170000),
('face-spiral','face','Overthinking goggles',380000,190000),
('face-tears','face','Happy little tears',260000,130000),
('face-cyber','face','Cyber accountant visor',720000,360000),
('face-detective','face','Trust me moustache',300000,150000),
('body-diamond','body','Diamond hands bib',560000,280000),
('body-hodl','body','HODL hoodie',780000,390000),
('body-bull','body','Tiny bull cape',840000,420000),
('body-paper','body','Paper hands poncho',240000,120000),
('body-chill','body','Just chilling sweater',460000,230000),
('body-shrimp','body','Small shrimp vest',320000,160000),
('body-badge','body','Professional fly badge',180000,90000),
('body-scarf','body','Emotional value scarf',400000,200000),
('background-moon','background','Moon waiting room',1400000,700000),
('background-stonks','background','Stonks wallpaper',800000,400000),
('background-fine','background','Everything is fine room',900000,450000),
('background-grass','background','Touch grass window',600000,300000),
('background-backrooms','background','Liminal office wall',880000,440000),
('background-vapor','background','Vaporwave sunset',1100000,550000),
('background-pond','background','Capybara hot spring',1000000,500000),
('background-nightshift','background','Night shift terminal',700000,350000),
('sticker-stonks','sticker','Stonks arrow sticker',80000,40000),
('sticker-diamond','sticker','Diamond hands sticker',100000,50000),
('sticker-hodl','sticker','HODL sticky note',60000,30000),
('sticker-oops','sticker','Bought the top sticker',60000,30000),
('sticker-67','sticker','Six seven sticker',60000,30000),
('sticker-aura','sticker','Plus aura sticker',80000,40000),
('sticker-afk','sticker','Gone fishing sticker',60000,30000),
('sticker-value','sticker','Emotional support sticker',80000,40000),
('desk-capy','desk','Capybara desk buddy',640000,320000),
('desk-cat','desk','Keyboard cat buddy',600000,300000),
('desk-banana','desk','Banana for scale',200000,100000),
('desk-rock','desk','Emotional support rock',160000,80000),
('desk-fine','desk','Everything is fine mug',260000,130000),
('desk-noodles','desk','Overtime noodles',220000,110000),
('desk-duck','desk','Rubber duck advisor',300000,150000),
('desk-fishtank','desk','Working hard fish tank',540000,270000);
UPDATE room_catalog SET price=200000,resale=100000 WHERE id='head-cap';
UPDATE room_catalog SET price=400000,resale=200000 WHERE id='head-beanie';
UPDATE room_catalog SET price=1200000,resale=600000 WHERE id='head-crown';
UPDATE room_catalog SET price=300000,resale=150000 WHERE id='face-glasses';
UPDATE room_catalog SET price=800000,resale=400000 WHERE id='face-monocle';
UPDATE room_catalog SET price=600000,resale=300000 WHERE id='face-visor';
UPDATE room_catalog SET price=100000,resale=50000 WHERE id='body-tie';
UPDATE room_catalog SET price=400000,resale=200000 WHERE id='body-bowtie';
UPDATE room_catalog SET price=900000,resale=450000 WHERE id='body-vest';
UPDATE room_catalog SET price=500000,resale=250000 WHERE id='background-mint';
UPDATE room_catalog SET price=500000,resale=250000 WHERE id='background-rose';
UPDATE room_catalog SET price=700000,resale=350000 WHERE id='background-graphite';
UPDATE room_catalog SET price=80000,resale=40000 WHERE id='sticker-star';
UPDATE room_catalog SET price=120000,resale=60000 WHERE id='sticker-bitcoin';
UPDATE room_catalog SET price=160000,resale=80000 WHERE id='sticker-moon';
UPDATE room_catalog SET price=300000,resale=150000 WHERE id='desk-lamp';
UPDATE room_catalog SET price=240000,resale=120000 WHERE id='desk-plant';
UPDATE room_catalog SET price=100000,resale=50000 WHERE id='desk-coffee';
