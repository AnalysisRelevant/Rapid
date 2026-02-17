describe('OvertureService', () => {
  let overture;

  class MockContext {
    constructor() {
      this.systems = {};
      this.services = {
        vectortile: {
          initAsync: () => Promise.resolve(),
          startAsync: () => Promise.resolve()
        }
      };
    }
  }

  beforeEach(() => {
    overture = new Rapid.OvertureService(new MockContext());
  });


  describe('#_geojsonToOSM', () => {
    const triangle = {
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
      },
      properties: { id: '08f2649b-0733-b91f' }
    };

    it('sets source tag for Microsoft ML Buildings', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'ml-buildings-overture', 'Microsoft ML Buildings');
      const way = entities[entities.length - 1];
      expect(way.tags.source).to.eql('microsoft/BuildingFootprints');
    });

    it('sets source tag for Google Open Buildings', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'ml-buildings-overture', 'Google Open Buildings');
      const way = entities[entities.length - 1];
      expect(way.tags.source).to.eql('google/OpenBuildings');
    });

    it('sets source tag for Esri Community Maps', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'esri-buildings', 'Esri Community Maps');
      const way = entities[entities.length - 1];
      expect(way.tags.source).to.eql('esri/CommunityMaps');
    });

    it('omits source tag for unknown geometry source', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'esri-buildings', 'SomeOtherSource');
      const way = entities[entities.length - 1];
      expect(way.tags.source).to.be.undefined;
    });

    it('always tags building=yes', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'esri-buildings', 'Esri Community Maps');
      const way = entities[entities.length - 1];
      expect(way.tags.building).to.eql('yes');
    });

    it('stores GERS ID from properties', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'esri-buildings', 'Esri Community Maps');
      const way = entities[entities.length - 1];
      expect(way.__gersid__).to.eql('08f2649b-0733-b91f');
    });

    it('creates a closed way with correct node count', () => {
      const entities = overture._geojsonToOSM(triangle, 'feat1', 'esri-buildings', 'Esri Community Maps');
      const way = entities[entities.length - 1];
      // 3 unique coords → 3 nodes, way refs = [n0, n1, n2, n0]
      expect(way.nodes.length).to.eql(4);
      expect(way.nodes[0]).to.eql(way.nodes[3]);
    });

    it('returns null for missing geometry', () => {
      expect(overture._geojsonToOSM({}, 'feat1', 'esri-buildings', 'Esri Community Maps')).to.be.null;
    });

    it('returns null for too few coordinates', () => {
      const bad = { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } };
      expect(overture._geojsonToOSM(bad, 'feat1', 'esri-buildings', 'Esri Community Maps')).to.be.null;
    });
  });


  describe('#_geojsonToOSMLine', () => {
    it('creates an open way from LineString coordinates', () => {
      const coords = [[0, 0], [1, 0], [1, 1]];
      const props = { class: 'residential', id: 'gers-123' };
      const entities = overture._geojsonToOSMLine(coords, props, 'feat1', 'tomtom-roads', 'TomTom');
      const way = entities[entities.length - 1];

      // 3 coords → 3 nodes, way should NOT be closed
      expect(way.nodes.length).to.eql(3);
      expect(way.nodes[0]).to.not.eql(way.nodes[2]);
    });

    it('sets metadata on nodes and way', () => {
      const coords = [[0, 0], [1, 0]];
      const props = { class: 'residential', id: 'gers-456' };
      const entities = overture._geojsonToOSMLine(coords, props, 'feat1', 'tomtom-roads', 'TomTom');
      const way = entities[entities.length - 1];
      const node = entities[0];

      expect(way.__fbid__).to.eql('tomtom-roads-feat1');
      expect(way.__service__).to.eql('overture');
      expect(way.__datasetid__).to.eql('tomtom-roads');
      expect(way.__gersid__).to.eql('gers-456');

      expect(node.__fbid__).to.eql('tomtom-roads-feat1-n0');
      expect(node.__service__).to.eql('overture');
      expect(node.__datasetid__).to.eql('tomtom-roads');
    });

    it('applies tag mapping from properties', () => {
      const coords = [[0, 0], [1, 0]];
      const props = { class: 'primary' };
      const entities = overture._geojsonToOSMLine(coords, props, 'feat1', 'tomtom-roads', 'TomTom');
      const way = entities[entities.length - 1];
      expect(way.tags.highway).to.eql('primary');
      expect(way.tags.source).to.eql('TomTom');
    });

    it('returns null for too few coordinates', () => {
      expect(overture._geojsonToOSMLine([[0, 0]], {}, 'feat1', 'tomtom-roads', 'TomTom')).to.be.null;
    });

    it('returns null for null coords', () => {
      expect(overture._geojsonToOSMLine(null, {}, 'feat1', 'tomtom-roads', 'TomTom')).to.be.null;
    });
  });


  describe('#_getTransportationSource', () => {
    it('returns source from @geometry_source property', () => {
      expect(overture._getTransportationSource({ '@geometry_source': 'TomTom' })).to.eql('TomTom');
    });

    it('returns source from sources array with dataset field', () => {
      expect(overture._getTransportationSource({
        sources: [{ dataset: 'TomTom', license: 'ODbL-1.0' }]
      })).to.eql('TomTom');
    });

    it('parses sources when encoded as JSON string', () => {
      expect(overture._getTransportationSource({
        sources: '[{"dataset":"TomTom","license":"ODbL-1.0"}]'
      })).to.eql('TomTom');
    });

    it('returns null for missing properties', () => {
      expect(overture._getTransportationSource(null)).to.be.null;
      expect(overture._getTransportationSource({})).to.be.null;
    });

    it('returns null for empty sources array', () => {
      expect(overture._getTransportationSource({ sources: [] })).to.be.null;
    });

    it('returns null for malformed JSON string', () => {
      expect(overture._getTransportationSource({ sources: 'not-json' })).to.be.null;
    });

    it('prefers @geometry_source over sources array', () => {
      expect(overture._getTransportationSource({
        '@geometry_source': 'Google',
        sources: [{ dataset: 'TomTom' }]
      })).to.eql('Google');
    });
  });


  describe('#_mapOvertureTransportationTags', () => {
    it('maps basic highway class', () => {
      const tags = overture._mapOvertureTransportationTags({ class: 'residential' });
      expect(tags.highway).to.eql('residential');
      expect(tags.source).to.eql('TomTom');
    });

    it('maps unknown class to road', () => {
      const tags = overture._mapOvertureTransportationTags({ class: 'unknown' });
      expect(tags.highway).to.eql('road');
    });

    it('appends _link for link subclass', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'motorway',
        subclass_rules: [{ value: 'link' }]
      });
      expect(tags.highway).to.eql('motorway_link');
    });

    it('does not append _link for non-link types', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        subclass_rules: [{ value: 'link' }]
      });
      // residential is not in the linkTypes set
      expect(tags.highway).to.eql('residential');
    });

    it('handles subclass_rules as a string', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'primary',
        subclass_rules: 'link'
      });
      expect(tags.highway).to.eql('primary_link');
    });

    it('maps sidewalk subclass to footway=sidewalk', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'footway',
        subclass_rules: [{ value: 'sidewalk' }]
      });
      expect(tags.highway).to.eql('footway');
      expect(tags.footway).to.eql('sidewalk');
    });

    it('maps crosswalk subclass to footway=crossing', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'footway',
        subclass_rules: [{ value: 'crosswalk' }]
      });
      expect(tags.footway).to.eql('crossing');
    });

    it('does not set footway tag if highway is not footway', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        subclass_rules: [{ value: 'sidewalk' }]
      });
      expect(tags.footway).to.be.undefined;
    });

    it('maps road_surface to surface tag', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        road_surface: [{ value: 'gravel' }]
      });
      expect(tags.surface).to.eql('gravel');
    });

    it('handles surface as a string fallback', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        surface: 'paved'
      });
      expect(tags.surface).to.eql('paved');
    });

    it('always sets source=TomTom', () => {
      const tags = overture._mapOvertureTransportationTags({});
      expect(tags.source).to.eql('TomTom');
    });
  });


  describe('#_sampleLinePoints', () => {
    it('returns empty for less than 2 coords', () => {
      expect(overture._sampleLinePoints([[0, 0]], 20, 5)).to.eql([]);
      expect(overture._sampleLinePoints([], 20, 5)).to.eql([]);
      expect(overture._sampleLinePoints(null, 20, 5)).to.eql([]);
    });

    it('returns first point for zero-length line', () => {
      const result = overture._sampleLinePoints([[5, 5], [5, 5]], 20, 5);
      expect(result.length).to.eql(1);
      expect(result[0]).to.eql([5, 5]);
    });

    it('samples points along a line', () => {
      // A line about 111km long (1 degree of latitude)
      const coords = [[0, 0], [0, 1]];
      const result = overture._sampleLinePoints(coords, 20, 5);
      expect(result.length).to.be.greaterThan(1);
      expect(result.length).to.be.at.most(20);
      // First point should be the start
      expect(result[0]).to.eql([0, 0]);
    });

    it('respects maxSamples limit', () => {
      const coords = [[0, 0], [0, 1]];
      const result = overture._sampleLinePoints(coords, 5, 1);
      expect(result.length).to.be.at.most(5);
    });
  });


  describe('#_distMeters', () => {
    it('returns 0 for same point', () => {
      expect(overture._distMeters([0, 0], [0, 0])).to.eql(0);
    });

    it('returns approximately correct distance for 1 degree latitude', () => {
      // 1 degree of latitude ≈ 111,320 meters
      const dist = overture._distMeters([0, 0], [0, 1]);
      expect(dist).to.be.greaterThan(110000);
      expect(dist).to.be.lessThan(112000);
    });

    it('accounts for longitude compression at higher latitudes', () => {
      // At 60°N, 1 degree longitude ≈ half of what it is at equator
      const distEquator = overture._distMeters([0, 0], [1, 0]);
      const dist60 = overture._distMeters([0, 60], [1, 60]);
      expect(dist60).to.be.lessThan(distEquator * 0.6);
      expect(dist60).to.be.greaterThan(distEquator * 0.4);
    });
  });


  describe('#_pointToSegmentDistance', () => {
    it('returns 0 for point on segment', () => {
      const dist = overture._pointToSegmentDistance([0.5, 0], [0, 0], [1, 0]);
      expect(dist).to.be.lessThan(1); // should be ~0
    });

    it('returns distance to nearest endpoint when projection falls outside', () => {
      // Point is beyond the end of the segment
      const dist = overture._pointToSegmentDistance([2, 0], [0, 0], [1, 0]);
      const endpointDist = overture._distMeters([2, 0], [1, 0]);
      expect(Math.abs(dist - endpointDist)).to.be.lessThan(1);
    });

    it('returns perpendicular distance for projection within segment', () => {
      // Point above midpoint of horizontal segment
      const dist = overture._pointToSegmentDistance([0.5, 0.001], [0, 0], [1, 0]);
      // Should be approximately the N-S distance of 0.001 degrees ≈ 111m
      expect(dist).to.be.greaterThan(100);
      expect(dist).to.be.lessThan(120);
    });
  });


  describe('#_pointToLineDistance', () => {
    it('returns minimum distance across all segments', () => {
      // L-shaped polyline
      const line = [[0, 0], [1, 0], [1, 1]];
      // Point near the second segment
      const dist = overture._pointToLineDistance([1.001, 0.5], line);
      // Should be close to 0.001 degrees ≈ 111m longitude at equator, but ~55m at lat 0.5
      expect(dist).to.be.greaterThan(50);
      expect(dist).to.be.lessThan(150);
    });
  });


  describe('#_conflateTransportation', () => {
    // _conflateTransportation requires a fully wired context with editor, viewport, etc.
    // These tests use minimal mocks to test the filtering and conversion logic.

    function makeContextWithOSMHighways(osmWays) {
      // Build a minimal mock graph and editor
      const nodeEntities = {};
      const wayEntities = {};
      const allEntities = [];

      for (const w of osmWays) {
        const nodeIDs = [];
        for (let i = 0; i < w.coords.length; i++) {
          const nodeID = `n${Object.keys(nodeEntities).length}`;
          nodeEntities[nodeID] = { id: nodeID, type: 'node', loc: w.coords[i] };
          nodeIDs.push(nodeID);
        }
        const wayID = `w${Object.keys(wayEntities).length}`;
        const way = {
          id: wayID,
          type: 'way',
          tags: { highway: w.highway },
          nodes: nodeIDs
        };
        wayEntities[wayID] = way;
        allEntities.push(way);
      }

      const graph = {
        entity: (id) => nodeEntities[id] || wayEntities[id]
      };

      return {
        systems: {
          editor: {
            staging: { graph },
            intersects: () => allEntities,
            on: () => {}
          }
        },
        services: {
          vectortile: {
            initAsync: () => Promise.resolve(),
            startAsync: () => Promise.resolve()
          }
        },
        viewport: {
          transform: { zoom: 18 },
          visibleExtent: () => ({
            min: [-180, -90],
            max: [180, 90],
            rectangle: () => [-180, -90, 180, 90]
          })
        }
      };
    }

    it('rejects OSM-sourced features', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
          properties: { '@geometry_source': 'OpenStreetMap', class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('rejects non-TomTom features', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
          properties: { '@geometry_source': 'SomeOther', class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('accepts TomTom features with no nearby OSM highways', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });

    it('accepts TomTom features via sources JSON string', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1b',
        geojson: {
          id: 'f1b',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: '[{"dataset":"TomTom"}]', class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });

    it('skips Point geometry', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { '@geometry_source': 'TomTom', class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('deduplicates features by ID', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      // Process twice
      svc._conflateTransportation(features, 'tomtom-roads');
      // Second call: f1 is already in seen set, should not add again
      const result = svc._conflateTransportation(features, 'tomtom-roads');
      // The ways from tree should contain only 1 way (from the first call)
      const ways = result.filter(e => e.type === 'way');
      expect(ways.length).to.eql(1);
    });

    it('returns empty for null/empty input', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);
      expect(svc._conflateTransportation(null, 'tomtom-roads')).to.eql([]);
      expect(svc._conflateTransportation([], 'tomtom-roads')).to.eql([]);
    });

    it('rejects TomTom road overlapping a same-mode OSM highway', () => {
      const ctx = makeContextWithOSMHighways([
        { highway: 'residential', coords: [[10, 10], [10.001, 10]] }
      ]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f2',
        geojson: {
          id: 'f2',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('does not reject a non-motorized road near a motorized OSM highway', () => {
      const ctx = makeContextWithOSMHighways([
        { highway: 'residential', coords: [[10, 10], [10.001, 10]] }
      ]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f3',
        geojson: {
          id: 'f3',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'footway' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });
  });

});
