#!/usr/bin/env osascript -l JavaScript
ObjC.import('stdlib');

function run(argv) {
  const Reminders = Application('Reminders');
  Reminders.includeStandardAdditions = true;

  try {
    if (argv.length >= 2 && argv[0] === 'complete') {
      const uid = argv[1];
      // Reminders.reminders.whose({id: uid}) ist unzuverlässig über Listen hinweg —
      // stattdessen über alle Listen iterieren.
      const lists = Reminders.lists();
      for (let i = 0; i < lists.length; i++) {
        const rems = lists[i].reminders();
        for (let j = 0; j < rems.length; j++) {
          if (rems[j].id() === uid) {
            rems[j].completed = true;
            return JSON.stringify({ ok: true });
          }
        }
      }
      return JSON.stringify({ error: 'reminder not found: ' + uid });
    }

    // Default: alle nicht-erledigten Erinnerungen aus allen Listen
    const result = [];
    const lists = Reminders.lists();
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      const listName = list.name();
      const rems = list.reminders.whose({ completed: false })();
      for (let j = 0; j < rems.length; j++) {
        const r = rems[j];
        result.push({
          id:           r.id(),
          title:        r.name() || '',
          listName:     listName,
          dueDate:      r.dueDate() ? r.dueDate().toISOString() : null,
          reminderDate: r.remindMeDate() ? r.remindMeDate().toISOString() : null,
          completed:    false,
          notes:        r.body() || null,
        });
      }
    }
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}
