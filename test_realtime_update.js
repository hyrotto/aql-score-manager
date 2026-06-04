const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  let received = false;
  
  const channel = supabase
    .channel('test-update')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, (payload) => {
      console.log('Realtime UPDATE received:', payload.new.id);
      received = true;
    })
    .subscribe(async (status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Updating a row to test realtime...');
        // get one row id
        const { data } = await supabase.from('rooms').select('id, state').limit(1);
        if (data && data.length > 0) {
          const id = data[0].id;
          const { error } = await supabase.from('rooms').update({ state: data[0].state }).eq('id', id);
          if (error) console.error('Update error:', error);
          else console.log('Update sent for room', id);
        } else {
          console.log('No rooms found to test.');
          process.exit(0);
        }
      }
    });

  setTimeout(() => {
    if (!received) {
      console.log('Timeout: No realtime event received after update. Publication might not be enabled for table "rooms".');
      process.exit(1);
    } else {
      console.log('Success: Realtime event received!');
      process.exit(0);
    }
  }, 10000);
}

test();
