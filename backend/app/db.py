"""Portable relational schema: PostgreSQL in Compose, SQLite for local demos."""
import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import (create_engine, MetaData, Table, Column, Integer, String, Float,
                        Boolean, DateTime, ForeignKey, JSON, event, select, UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB

def now():
    return datetime.now(timezone.utc)

url = os.getenv('DATABASE_URL', f"sqlite:///{Path(__file__).resolve().parents[1] / 'resilifarm.db'}")
if os.getenv('DB_HOST'):
    from sqlalchemy.engine import URL
    url = URL.create('postgresql+psycopg', username='resilifarm', password=os.environ['DB_PASSWORD'], host=os.environ['DB_HOST'], database='resilifarm').render_as_string(hide_password=False)
engine = create_engine(url, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {})
if url.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_fk(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
metadata = MetaData()
json_type = JSON().with_variant(JSONB, 'postgresql')

def entity(name, *cols, constraints=()):
    return Table(name, metadata, Column('id', Integer, primary_key=True), *cols,
                 Column('created_at', DateTime(timezone=True), default=now, nullable=False), *constraints)

def ref(name, table):
    return Column(name, ForeignKey(f'{table}.id'), nullable=False, index=True)

countries = entity('countries', Column('code', String(2), unique=True, nullable=False), Column('name', String(80)))
regions = entity('administrative_areas', ref('country_id', 'countries'), Column('name', String(80)), Column('lat', Float), Column('lon', Float), Column('climate', String(40)))
zones = entity('agricultural_zones', ref('region_id', 'administrative_areas'), Column('name', String(80)))
farms = entity('farms', ref('zone_id', 'agricultural_zones'), Column('name', String(80)))
crops = entity('crop_profiles', Column('name', String(40), unique=True), Column('coefficients', json_type))
fields = entity('fields', ref('farm_id', 'farms'), ref('crop_id', 'crop_profiles'), Column('name', String(80)), Column('area_ha', Float), Column('lat', Float), Column('lon', Float))
networks = entity('water_networks', ref('region_id', 'administrative_areas'), Column('name', String(80)))
nodes = entity('water_nodes', ref('network_id', 'water_networks'), Column('name', String(40)), Column('kind', String(30)))
pipes = entity('water_pipes', ref('network_id', 'water_networks'), ref('from_node', 'water_nodes'), ref('to_node', 'water_nodes'), Column('length_m', Float), Column('diameter_m', Float))
projects = entity('aiot_projects', ref('region_id', 'administrative_areas'), Column('name', String(160)), Column('deployed', Boolean, default=False, nullable=False))
versions = entity('aiot_design_versions', ref('project_id', 'aiot_projects'), Column('version', Integer), Column('design', json_type), constraints=(UniqueConstraint('project_id', 'version'),))
messages = entity('aiot_conversation_messages', ref('project_id', 'aiot_projects'), Column('role', String(20)), Column('text', String(4000)))
components = entity('aiot_components', Column('key', String(60), unique=True), Column('specification', json_type))
connections = entity('aiot_connections', ref('version_id', 'aiot_design_versions'), Column('source', String(80)), Column('target', String(80)), Column('signal', String(100)))
records = {}
for name in ['weather_observations', 'sensor_readings', 'energy_systems', 'predictions', 'alerts', 'irrigation_recommendations', 'simulation_runs']:
    records[name] = entity(name, ref('region_id', 'administrative_areas'), Column('is_simulated', Boolean, nullable=False, default=True), Column('source', String(120)), Column('payload', json_type))

REGIONS = [
    {'id': 1, 'country_id': 1, 'name': 'Kairouan', 'lat': 35.6781, 'lon': 10.0963, 'climate': 'semiArid'},
    {'id': 2, 'country_id': 1, 'name': 'Jendouba', 'lat': 36.5011, 'lon': 8.7802, 'climate': 'subHumid'},
    {'id': 3, 'country_id': 2, 'name': 'Fukuoka', 'lat': 33.6064, 'lon': 130.4181, 'climate': 'humid'},
]
KC = {'olive': [0.55, 0.65, 0.60], 'wheat': [0.30, 1.15, 0.40], 'tomato': [0.60, 1.15, 0.80]}

def initialize():
    metadata.create_all(engine)
    with engine.begin() as c:
        if c.execute(select(countries.c.id)).first():
            return
        c.execute(countries.insert(), [{'id': 1, 'code': 'TN', 'name': 'Tunisia'}, {'id': 2, 'code': 'JP', 'name': 'Japan'}])
        c.execute(regions.insert(), REGIONS)
        c.execute(crops.insert(), [{'id': i+1, 'name': k, 'coefficients': v} for i, (k,v) in enumerate(KC.items())])
        for r in REGIONS:
            rid = r['id']
            c.execute(zones.insert().values(id=rid, region_id=rid, name='Demo zone'))
            c.execute(farms.insert().values(id=rid, zone_id=rid, name=f"{r['name']} · Demo"))
            c.execute(networks.insert().values(id=rid, region_id=rid, name='Demo network'))
            for i in range(3):
                c.execute(fields.insert().values(id=rid*10+i, farm_id=rid, crop_id=i+1, name=f'F-{i+1:02}', area_ha=[5,3,2][i], lat=r['lat']+.009*i, lon=r['lon']+.012*i))
                c.execute(nodes.insert().values(id=rid*10+i, network_id=rid, name=['reservoir','pump','field'][i], kind=['storage','pump','demand'][i]))
            for i in range(2):
                c.execute(pipes.insert().values(network_id=rid, from_node=rid*10+i, to_node=rid*10+i+1, length_m=150, diameter_m=.08))

def save_record(name, region_id, payload, source='deterministic-demo', simulated=True):
    with engine.begin() as c:
        return c.execute(records[name].insert().values(region_id=region_id, payload=payload, source=source, is_simulated=simulated)).inserted_primary_key[0]
