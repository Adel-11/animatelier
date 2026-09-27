# Outils QFF (Quiz Factory Forever)

Scripts utilisés par les tâches planifiées qui produisent et publient les Reels quiz de @quiz.factory.forever.

- `qff.py` : production d'un quiz (planning, voix, rendu avec Animatelier, mixage, publication, journal).
- `commons.py` : recherche et téléchargement de sons libres sur Wikimedia Commons.

Les clés des webhooks n8n ne sont pas dans le dépôt : `qff.py` les lit dans `~/.qff_keys.json`
(`{"drive": "...", "publish": "..."}`) ou dans les variables `QFF_DRIVE_KEY` et `QFF_PUB_KEY`.
