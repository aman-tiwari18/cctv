import requests
import json

url = 'https://D15.camview.io/admin/API/accounts/authorize'
headers = {'Content-Type': 'application/json'}
payload = {'userName': 'system', 'ipAddress': '', 'clientType': 'WINPC_V1'}

res = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
print(f'Status: {res.status_code}')
print(f'Content length: {len(res.content)}')

# Try parsing
try:
    data = json.loads(res.content.decode('utf-8'))
    print(f'Parsed JSON successfully!')
    print(f'Keys: {list(data.keys())}')
    print(f'Has realm: {"realm" in data}')
    print(f'Has randomKey: {"randomKey" in data}')
    print(f'Has publickey: {"publickey" in data}')
except Exception as e:
    print(f'Parse error: {e}')
    print(f'Raw content[:500]: {res.content[:500]}')
