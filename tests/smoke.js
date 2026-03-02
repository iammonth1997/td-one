(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emp_id: 'TEST', pin: '1234', device_id: 'dev1' }),
    });

    const text = await res.text();
    console.log('status', res.status);

    try {
      const json = JSON.parse(text);
      console.log('body', JSON.stringify(json));
      if (json && (json.error || json.success)) {
        console.log('SMOKE_TEST: OK');
        process.exit(0);
      }
      console.error('SMOKE_TEST: Unexpected response shape');
      process.exit(2);
    } catch (err) {
      console.error('Failed to parse JSON response:', text);
      process.exit(1);
    }
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
