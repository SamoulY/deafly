CREATE TABLE flydesk_dataset_chunks (dataset_id TEXT NOT NULL REFERENCES flydesk_datasets(id),chunk_index INTEGER NOT NULL,bars_json TEXT NOT NULL,PRIMARY KEY(dataset_id,chunk_index));
