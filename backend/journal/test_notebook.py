import json, uuid
from datetime import date
from unittest.mock import patch
from io import BytesIO
from PIL import Image
from django.test import TestCase, Client
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Account, Memory, Album, Media

class NotebookTests(TestCase):
    def setUp(self):
        self.owner=Account.objects.create_user(username='deniz', email='deniz@example.test', password='test-password-34')
        self.other=Account.objects.create_user(username='orman', email='orman@example.test', password='test-password-56')
        self.a, self.b=Client(), Client()
        self.a.force_login(self.owner); self.b.force_login(self.other)
        self.mid=str(uuid.uuid4())

    def image(self):
        b=BytesIO(); Image.new('RGB',(12,12),'green').save(b,'PNG')
        return SimpleUploadedFile('test.png',b.getvalue(),content_type='image/png')

    def save(self, client=None, **changes):
        payload={'title':'Yaz', 'body':'Bir hatıra', 'date':'2024-11-10', 'category':'Doğa', 'visibility':'public','action':'draft', 'revision':'0','order':'[]'}
        payload.update(changes)
        return (client or self.a).post('/api/entries/'+self.mid,payload)

    def test_drafts_private_and_publish(self):
        key=str(uuid.uuid4())
        r=self.save(title='',body='',order=json.dumps([key]),**{key:self.image()})
        self.assertEqual(r.status_code,201,r.content)
        for client in [self.a,self.b,Client()]:
            self.assertEqual(client.get('/api/memories').json()['memories'],[])
            self.assertEqual(client.get('/api/profiles',{'username':'deniz'}).json()['profile']['memoryCount'],0)
            self.assertEqual(client.get('/api/profiles',{'username':'deniz'}).json()['memories'],[])
        self.assertEqual(self.a.get('/api/photo',{'id':key}).status_code,200)
        self.assertEqual(self.b.get('/api/photo',{'id':key}).status_code,404)
        self.assertEqual(Client().get('/api/photo',{'id':key}).status_code,404)
        self.assertEqual(Client().get('/api/notebook').status_code,401)
        self.assertEqual(len(self.a.get('/api/notebook').json()['entries']),1)
        self.assertEqual(self.b.get('/api/notebook').json()['entries'],[])
        self.assertEqual(self.save(self.b,revision=1).status_code,404)
        self.assertEqual(self.save(action='publish',revision=1,title='',body='').status_code,400)
        self.assertEqual(self.save(action='publish',revision=1,order=json.dumps([key])).status_code,200)
        self.assertEqual(len(self.b.get('/api/memories').json()['memories']),1)
        self.assertEqual(self.b.get('/api/photo',{'id':key}).status_code,200)

    def test_edit_reorder_conflict_and_atomic_validation(self):
        one,two=str(uuid.uuid4()),str(uuid.uuid4())
        self.assertEqual(self.save(action='publish',order=json.dumps([one,two]),**{one:self.image(),two:self.image()}).status_code,201)
        self.assertEqual(self.save(action='publish',revision=1,visibility='private',title='Değişti',order=json.dumps([two,one])).status_code,200)
        row=self.a.get('/api/notebook').json()['entries'][0]
        self.assertEqual(row['photo'],two);self.assertEqual(row['title'],'Değişti')
        self.assertEqual(self.b.get('/api/photo',{'id':two}).status_code,404)
        self.assertEqual(self.save(action='publish',revision=1).status_code,409)
        bad=str(uuid.uuid4())
        self.assertEqual(self.save(action='publish',revision=2,title='Kaydedilmemeli',order=json.dumps([bad]),**{bad:SimpleUploadedFile('x.png',b'not an image')}).status_code,400)
        self.assertEqual(Memory.objects.get(pk=self.mid).title,'Değişti')
        self.assertEqual(Media.objects.filter(memory_id=self.mid).count(),2)
        self.assertEqual(self.save(action='publish',revision=2,order=json.dumps([two])).status_code,200)
        self.assertFalse(Media.objects.filter(pk=one).exists())

    def test_album_ownership_delete_keeps_memory(self):
        r=self.a.post('/api/albums',{'name':'Üniversite'},content_type='application/json');self.assertEqual(r.status_code,201)
        album=r.json()['id']
        self.assertEqual(self.a.post('/api/albums',{'name':'Üniversite'},content_type='application/json').status_code,409)
        self.assertEqual(self.save(self.b,album=album).status_code,404)
        self.assertEqual(self.save(action='publish',album=album).status_code,201)
        self.assertEqual(self.b.get('/api/memories').json()['memories'][0]['album'],'')
        self.assertEqual(self.b.delete('/api/albums',json.dumps({'id':album}),content_type='application/json').status_code,404)
        self.assertEqual(self.a.delete('/api/albums',json.dumps({'id':album}),content_type='application/json').status_code,200)
        self.assertIsNone(Memory.objects.get(pk=self.mid).album_id)

    @patch('journal.notebook.timezone.localdate', return_value=date(2026,11,10))
    def test_anniversaries_owner_published_previous_years(self,_):
        for owner,day,draft in [(self.owner,'2024-11-10',False),(self.owner,'2026-11-10',False),(self.owner,'2024-11-09',False),(self.owner,'2023-11-10',True),(self.other,'2022-11-10',False)]:
            Memory.objects.create(owner=owner,date=day,is_draft=draft,title='Anı',body='Hikaye',category='Doğa',visibility='private')
        result=self.a.get('/api/anniversaries').json()['items']
        self.assertEqual(len(result),1);self.assertEqual(result[0]['years'],2)
        self.assertEqual(result[0]['memory']['owner'],str(self.owner.pk))
        self.assertEqual(Client().get('/api/anniversaries').status_code,401)
