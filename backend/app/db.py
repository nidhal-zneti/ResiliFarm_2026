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
    {'id': 4, 'country_id': 1, 'name': 'Ariana', 'lat': 36.86250, 'lon': 10.19556, 'climate': 'subHumid'},
    {'id': 5, 'country_id': 1, 'name': 'Beja', 'lat': 36.73333, 'lon': 9.18333, 'climate': 'subHumid'},
    {'id': 6, 'country_id': 1, 'name': 'Ben Arous', 'lat': 36.75333, 'lon': 10.22220, 'climate': 'subHumid'},
    {'id': 7, 'country_id': 1, 'name': 'Bizerte', 'lat': 37.29000, 'lon': 9.87000, 'climate': 'subHumid'},
    {'id': 8, 'country_id': 1, 'name': 'Gabes', 'lat': 33.88333, 'lon': 10.11667, 'climate': 'semiArid'},
    {'id': 9, 'country_id': 1, 'name': 'Gafsa', 'lat': 34.42500, 'lon': 8.78417, 'climate': 'semiArid'},
    {'id': 10, 'country_id': 1, 'name': 'Kasserine', 'lat': 35.18000, 'lon': 8.83000, 'climate': 'semiArid'},
    {'id': 11, 'country_id': 1, 'name': 'Kebili', 'lat': 33.70194, 'lon': 8.97361, 'climate': 'semiArid'},
    {'id': 12, 'country_id': 1, 'name': 'Kef', 'lat': 36.19000, 'lon': 8.71000, 'climate': 'subHumid'},
    {'id': 13, 'country_id': 1, 'name': 'Mahdia', 'lat': 35.52000, 'lon': 11.07000, 'climate': 'semiArid'},
    {'id': 14, 'country_id': 1, 'name': 'Manouba', 'lat': 36.80778, 'lon': 10.10111, 'climate': 'subHumid'},
    {'id': 15, 'country_id': 1, 'name': 'Medenine', 'lat': 33.35000, 'lon': 10.49000, 'climate': 'semiArid'},
    {'id': 16, 'country_id': 1, 'name': 'Monastir', 'lat': 35.79000, 'lon': 10.82000, 'climate': 'semiArid'},
    {'id': 17, 'country_id': 1, 'name': 'Nabeul', 'lat': 36.45000, 'lon': 10.73333, 'climate': 'subHumid'},
    {'id': 18, 'country_id': 1, 'name': 'Sfax', 'lat': 34.74056, 'lon': 10.76028, 'climate': 'semiArid'},
    {'id': 19, 'country_id': 1, 'name': 'Sidi Bouzid', 'lat': 35.04028, 'lon': 9.49361, 'climate': 'semiArid'},
    {'id': 20, 'country_id': 1, 'name': 'Siliana', 'lat': 36.08333, 'lon': 9.36667, 'climate': 'subHumid'},
    {'id': 21, 'country_id': 1, 'name': 'Sousse', 'lat': 35.82556, 'lon': 10.64111, 'climate': 'semiArid'},
    {'id': 22, 'country_id': 1, 'name': 'Tataouine', 'lat': 32.93333, 'lon': 10.45000, 'climate': 'semiArid'},
    {'id': 23, 'country_id': 1, 'name': 'Tozeur', 'lat': 33.93000, 'lon': 8.13000, 'climate': 'semiArid'},
    {'id': 24, 'country_id': 1, 'name': 'Tunis', 'lat': 36.80278, 'lon': 10.17972, 'climate': 'subHumid'},
    {'id': 25, 'country_id': 1, 'name': 'Zaghouan', 'lat': 36.40000, 'lon': 10.14000, 'climate': 'semiArid'},
]

def _degrees(degrees, minutes, seconds=0):
    return degrees + minutes / 60 + seconds / 3600

JP_PREFECTURES = [
    ('Aichi', 35, 11, 0, 136, 54, 0),
    ('Akita', 39, 43, 0, 140, 6, 0),
    ('Aomori', 40, 49, 0, 140, 44, 0),
    ('Chiba', 35, 36, 0, 140, 7, 0),
    ('Ehime', 33, 50, 0, 132, 46, 0),
    ('Fukui', 36, 4, 0, 136, 13, 0),
    ('Fukushima', 37, 45, 0, 140, 28, 0),
    ('Gifu', 35, 26, 0, 136, 47, 0),
    ('Gunma', 36, 24, 0, 139, 5, 0),
    ('Hiroshima', 34, 24, 0, 132, 27, 0),
    ('Hokkaido', 43, 4, 0, 141, 21, 0),
    ('Hyogo', 34, 41, 0, 135, 11, 0),
    ('Ibaraki', 36, 21, 0, 140, 27, 0),
    ('Ishikawa', 36, 36, 0, 136, 37, 0),
    ('Iwate', 39, 42, 0, 141, 9, 0),
    ('Kagawa', 34, 20, 0, 134, 3, 0),
    ('Kagoshima', 31, 34, 0, 130, 33, 0),
    ('Kanagawa', 35, 26, 0, 139, 39, 0),
    ('Kochi', 33, 33, 0, 133, 32, 0),
    ('Kumamoto', 32, 47, 0, 130, 44, 0),
    ('Kyoto', 35, 1, 0, 135, 45, 0),
    ('Mie', 34, 44, 0, 136, 31, 0),
    ('Miyagi', 38, 16, 0, 140, 52, 0),
    ('Miyazaki', 31, 55, 0, 131, 25, 0),
    ('Nagano', 36, 39, 0, 138, 11, 0),
    ('Nagasaki', 32, 45, 0, 129, 53, 0),
    ('Nara', 34, 41, 0, 135, 50, 0),
    ('Niigata', 37, 54, 0, 139, 0, 0),
    ('Oita', 33, 14, 0, 131, 36, 0),
    ('Okayama', 34, 39, 0, 133, 56, 0),
    ('Okinawa', 26, 13, 0, 127, 41, 0),
    ('Osaka', 34, 41, 0, 135, 31, 0),
    ('Saga', 33, 14, 0, 130, 18, 0),
    ('Saitama', 35, 54, 0, 139, 39, 0),
    ('Shiga', 35, 0, 0, 135, 52, 0),
    ('Shimane', 35, 29, 0, 133, 3, 0),
    ('Shizuoka', 34, 59, 0, 138, 23, 0),
    ('Tochigi', 36, 34, 0, 139, 53, 0),
    ('Tokushima', 34, 4, 0, 134, 34, 0),
    ('Tokyo', 35, 41, 6, 139, 45, 5),
    ('Tottori', 35, 30, 0, 134, 14, 0),
    ('Toyama', 36, 42, 0, 137, 13, 0),
    ('Wakayama', 34, 14, 0, 135, 10, 0),
    ('Yamagata', 38, 14, 0, 140, 22, 0),
    ('Yamaguchi', 34, 11, 0, 131, 28, 0),
    ('Yamanashi', 35, 40, 0, 138, 34, 0),
]
REGIONS.extend(
    {
        'id': 26 + i,
        'country_id': 2,
        'name': name,
        'lat': _degrees(lat_d, lat_m, lat_s),
        'lon': _degrees(lon_d, lon_m, lon_s),
        'climate': 'humid',
    }
    for i, (name, lat_d, lat_m, lat_s, lon_d, lon_m, lon_s) in enumerate(JP_PREFECTURES)
)
KC = {'olive': [0.55, 0.65, 0.60], 'wheat': [0.30, 1.15, 0.40], 'tomato': [0.60, 1.15, 0.80]}

def initialize():
    metadata.create_all(engine)
    with engine.begin() as c:
        for country in [{'id': 1, 'code': 'TN', 'name': 'Tunisia'}, {'id': 2, 'code': 'JP', 'name': 'Japan'}]:
            if not c.execute(select(countries.c.id).where(countries.c.id == country['id'])).first():
                c.execute(countries.insert().values(**country))
        existing = {row['id'] for row in c.execute(select(regions.c.id)).mappings()}
        for r in REGIONS:
            if r['id'] not in existing:
                c.execute(regions.insert().values(**r))
        crop_ids = {}
        for i, (name, coefficients) in enumerate(KC.items(), 1):
            crop_id = c.execute(select(crops.c.id).where(crops.c.name == name)).scalar_one_or_none()
            if crop_id is None:
                result = c.execute(crops.insert().values(name=name, coefficients=coefficients))
                crop_id = result.inserted_primary_key[0]
            crop_ids[name] = crop_id
        # Remove legacy generated demo records. Keep real region metadata, crop
        # profiles, user projects, and any explicitly non-simulated telemetry.
        demo_farms=list(c.execute(select(farms.c.id).where(
            farms.c.name.like('%Demo farm') | farms.c.name.like('% · Demo')
        )).scalars())
        if demo_farms:
            c.execute(fields.delete().where(fields.c.farm_id.in_(demo_farms)))
            c.execute(farms.delete().where(farms.c.id.in_(demo_farms)))
        demo_zones=list(c.execute(select(zones.c.id).where(zones.c.name.in_(['Illustrative zone · simulated','Demo zone']))).scalars())
        for zone_id in demo_zones:
            if not c.execute(select(farms.c.id).where(farms.c.zone_id==zone_id)).first():
                c.execute(zones.delete().where(zones.c.id==zone_id))
        demo_networks=list(c.execute(select(networks.c.id).where(networks.c.name.in_(['Illustrative network · simulated','Demo network']))).scalars())
        if demo_networks:
            c.execute(pipes.delete().where(pipes.c.network_id.in_(demo_networks)))
            c.execute(nodes.delete().where(nodes.c.network_id.in_(demo_networks)))
            c.execute(networks.delete().where(networks.c.id.in_(demo_networks)))
        for table in records.values():
            c.execute(table.delete().where(table.c.is_simulated==True))
        # A saved Studio design is not a physical deployment.
        c.execute(projects.update().where(projects.c.deployed==True).values(deployed=False))

def save_record(name, region_id, payload, source='deterministic-demo', simulated=True):
    with engine.begin() as c:
        return c.execute(records[name].insert().values(region_id=region_id, payload=payload, source=source, is_simulated=simulated)).inserted_primary_key[0]
