CREATE TABLE account_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), display_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'orbit');
CREATE TABLE room_catalog (id TEXT PRIMARY KEY,slot TEXT NOT NULL,name TEXT NOT NULL,price REAL NOT NULL CHECK(price>0),resale REAL NOT NULL CHECK(resale>=0 AND resale<price));
INSERT INTO room_catalog VALUES
('head-cap','head','Cap',20,10),('head-beanie','head','Beanie',40,20),('head-crown','head','Crown',120,60),
('face-glasses','face','Glasses',30,15),('face-monocle','face','Monocle',80,40),('face-visor','face','Visor',60,30),
('body-tie','body','Tie',10,5),('body-bowtie','body','Bow tie',40,20),('body-vest','body','Vest',90,45),
('background-mint','background','Mint wall',50,25),('background-rose','background','Rose wall',50,25),('background-graphite','background','Graphite wall',70,35),
('sticker-star','sticker','Lucky star sticker',8,4),('sticker-bitcoin','sticker','Bitcoin sticker',12,6),('sticker-moon','sticker','Moon sticker',16,8),
('desk-lamp','desk','Desk lamp',30,15),('desk-plant','desk','Little plant',24,12),('desk-coffee','desk','Coffee mug',10,5);
CREATE TABLE room_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE room_inventory (user_id TEXT NOT NULL REFERENCES users(id),item_id TEXT NOT NULL REFERENCES room_catalog(id),slot TEXT NOT NULL,equipped INTEGER NOT NULL DEFAULT 0 CHECK(equipped IN (0,1)),PRIMARY KEY(user_id,item_id));
CREATE UNIQUE INDEX room_one_slot ON room_inventory(user_id,slot) WHERE equipped=1;
-- A one-time migration preserves the existing fly's clothes, with no repeat grants.
CREATE TRIGGER room_initialize AFTER INSERT ON room_profiles BEGIN
 INSERT OR IGNORE INTO room_inventory SELECT NEW.user_id,c.id,c.slot,CASE WHEN json_extract(p.loadout_json,'$.'||c.slot)=c.id THEN 1 ELSE 0 END FROM raising_ownership o JOIN room_catalog c ON c.id=o.item_id JOIN raising_profiles p ON p.user_id=o.user_id WHERE o.user_id=NEW.user_id;
 INSERT OR IGNORE INTO room_inventory VALUES (NEW.user_id,'desk-lamp','desk',1);
END;
CREATE TABLE room_transactions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),item_id TEXT NOT NULL REFERENCES room_catalog(id),operation TEXT NOT NULL CHECK(operation IN ('BUY','SELL')),amount REAL NOT NULL,cash_after REAL NOT NULL DEFAULT 0,idempotency_key TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,idempotency_key));
CREATE TRIGGER room_trade_guard BEFORE INSERT ON room_transactions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolios WHERE user_id=NEW.user_id) THEN RAISE(ABORT,'ACCOUNT_NOT_FOUND') END;
 SELECT CASE WHEN NEW.operation='BUY' AND (NEW.amount<>(SELECT -price FROM room_catalog WHERE id=NEW.item_id) OR (SELECT cash FROM portfolios WHERE user_id=NEW.user_id)<-NEW.amount) THEN RAISE(ABORT,'INSUFFICIENT_CASH') END;
 SELECT CASE WHEN NEW.operation='SELL' AND NEW.amount<>(SELECT resale FROM room_catalog WHERE id=NEW.item_id) THEN RAISE(ABORT,'INVALID_PRICE') END;
 SELECT CASE WHEN NEW.operation='BUY' AND EXISTS(SELECT 1 FROM room_inventory WHERE user_id=NEW.user_id AND item_id=NEW.item_id) THEN RAISE(ABORT,'ALREADY_OWNED') END;
 SELECT CASE WHEN NEW.operation='SELL' AND NOT EXISTS(SELECT 1 FROM room_inventory WHERE user_id=NEW.user_id AND item_id=NEW.item_id) THEN RAISE(ABORT,'ITEM_NOT_OWNED') END;
END;
CREATE TRIGGER room_trade_apply AFTER INSERT ON room_transactions BEGIN
 UPDATE portfolios SET cash=cash+NEW.amount,revision=revision+1 WHERE user_id=NEW.user_id;
 -- A hat purchase is a cash flow, never a trading loss fed back to the brain.
 UPDATE autonomous_runs SET last_equity=last_equity+NEW.amount WHERE user_id=NEW.user_id AND status='RUNNING';
 INSERT INTO room_inventory SELECT NEW.user_id,NEW.item_id,slot,0 FROM room_catalog WHERE id=NEW.item_id AND NEW.operation='BUY';
 DELETE FROM room_inventory WHERE user_id=NEW.user_id AND item_id=NEW.item_id AND NEW.operation='SELL';
 UPDATE room_transactions SET cash_after=(SELECT cash FROM portfolios WHERE user_id=NEW.user_id) WHERE id=NEW.id;
END;
