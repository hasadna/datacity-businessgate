import os
import requests
import base64
import math
from io import BytesIO

from PIL import Image
from kvfile import KVFile

_cache = KVFile(filename='_cache_airtable')
override = set([])
for key in override:
    try:
        _cache.get(key)
        print('got', key)
        _cache.delete(key)
        print('deleted', key)
    except:
        print('no such key', key)
        pass

def fetch_airtable(kind, rid=None, view='Grid%20view'):
    API_KEY = os.environ.get('AIRTABLE_API_KEY')
    key = '%s/%s' % (kind, rid)
    try:
        return _cache.get(key)
    except (KeyError, AssertionError):
        HEADERS = {
            'Authorization': 'Bearer ' + API_KEY
        }
        URL = 'https://api.airtable.com/v0/app7mXbmkFuB1KYG5/' + kind
        print(URL)
        if rid:
            URL +=  '/' + rid
            ret = requests.get(URL, headers=HEADERS).json()['fields']
        else:
            URL += f'?view={view}&maxRecords=1000'
            ret = [x['fields'] for x in requests.get(URL, headers=HEADERS).json()['records']]
        _cache.set(key, ret)
        return ret

def fetch_ckan(dataset, resource_name):
    # API_KEY = os.environ.get('CKAN_API_KEY')
    CKAN_BASE = 'https://data.gov.il' + '/api/3/action'
    # headers = {'Authorization': API_KEY}
    dataset = requests.get(f'{CKAN_BASE}/package_show?id={dataset}').json()
    assert dataset['success']
    dataset = dataset['result']
    for resource in dataset['resources']:
        if resource['name'] == resource_name:
            return requests.get(resource['url'], stream=True).raw
    print('Failed to find resource', resource)

def to_data_url(url, width=96):
    key = 'data-url:' + url
    try:
        return _cache.get(key)
    except KeyError:
        im = Image.open(requests.get(url, stream=True).raw)
        ratio = width/im.width
        im = im.resize((width, math.floor(im.height*ratio)))
        out = BytesIO()
        im.save(out, 'jpeg', quality=50, optimize=True)
        ret = 'data:image/jpeg;base64,{}'.format(base64.encodebytes(out.getbuffer()).decode('ascii').replace('\n', ''))
        _cache.set(key, ret)
        return ret
