import { logger } from '../utils/logger';

interface Port {
  name: string;
  country?: string;
  region: string;
  lat?: number;
  lng?: number;
  unlocode?: string;
}

interface Route {
  from: string;
  to: string;
  distance: number; // nautical miles
  transitDays: number;
  canals: string[];
  restrictions?: string[];
  alternativeRoutes?: AlternativeRoute[];
}

interface AlternativeRoute {
  name: string;
  distance: number;
  transitDays: number;
  canals: string[];
  restrictions?: string[];
  additionalCost?: number;
}

interface RoutingResult {
  primaryRoute: Route;
  alternatives: AlternativeRoute[];
  vesselSuitability: {
    suitable: boolean;
    restrictions: string[];
    recommendations: string[];
  };
  timeAnalysis: {
    minTransitDays: number;
    maxTransitDays: number;
    weatherDelays: number;
    canalDelays: number;
  };
}

export class MaritimeRoutingService {
  private static readonly MAJOR_PORTS: Record<string, Port> = {
    // Avrupa
    'rotterdam': { name: 'Rotterdam', country: 'Netherlands', region: 'North Europe', lat: 51.9, lng: 4.5 },
    'hamburg': { name: 'Hamburg', country: 'Germany', region: 'North Europe', lat: 53.5, lng: 10.0 },
    'antwerp': { name: 'Antwerp', country: 'Belgium', region: 'North Europe', lat: 51.2, lng: 4.4 },
    'amsterdam': { name: 'Amsterdam', country: 'Netherlands', region: 'North Europe', lat: 52.4, lng: 4.9 },
    'le_havre': { name: 'Le Havre', country: 'France', region: 'North Europe', lat: 49.5, lng: 0.1 },
    
    // Akdeniz
    'algeciras': { name: 'Algeciras', country: 'Spain', region: 'Mediterranean', lat: 36.1, lng: -5.4 },
    'valencia': { name: 'Valencia', country: 'Spain', region: 'Mediterranean', lat: 39.5, lng: -0.4 },
    'genoa': { name: 'Genoa', country: 'Italy', region: 'Mediterranean', lat: 44.4, lng: 8.9 },
    'piraeus': { name: 'Piraeus', country: 'Greece', region: 'Mediterranean', lat: 37.9, lng: 23.6 },
    'istanbul': { name: 'Istanbul', country: 'Turkey', region: 'Mediterranean', lat: 41.0, lng: 29.0 },
    
    // Karadeniz
    'constanta': { name: 'Constanta', country: 'Romania', region: 'Black Sea', lat: 44.2, lng: 28.6 },
    'odessa': { name: 'Odessa', country: 'Ukraine', region: 'Black Sea', lat: 46.5, lng: 30.7 },
    'batumi': { name: 'Batumi', country: 'Georgia', region: 'Black Sea', lat: 41.6, lng: 41.6 },
    
    // Asya
    'shanghai': { name: 'Shanghai', country: 'China', region: 'Far East', lat: 31.2, lng: 121.5 },
    'singapore': { name: 'Singapore', country: 'Singapore', region: 'Southeast Asia', lat: 1.3, lng: 103.8 },
    'hong_kong': { name: 'Hong Kong', country: 'Hong Kong', region: 'Far East', lat: 22.3, lng: 114.2 },
    'busan': { name: 'Busan', country: 'South Korea', region: 'Far East', lat: 35.1, lng: 129.0 },
    'mumbai': { name: 'Mumbai', country: 'India', region: 'Indian Subcontinent', lat: 19.1, lng: 72.8 },
    
    // Orta Doğu
    'jebel_ali': { name: 'Jebel Ali', country: 'UAE', region: 'Persian Gulf', lat: 25.0, lng: 55.1 },
    'bandar_abbas': { name: 'Bandar Abbas', country: 'Iran', region: 'Persian Gulf', lat: 27.2, lng: 56.3 },
    
    // Amerika
    'new_york': { name: 'New York', country: 'USA', region: 'US East Coast', lat: 40.7, lng: -74.0 },
    'houston': { name: 'Houston', country: 'USA', region: 'US Gulf', lat: 29.8, lng: -95.3 },
    'los_angeles': { name: 'Los Angeles', country: 'USA', region: 'US West Coast', lat: 34.1, lng: -118.2 },
    'santos': { name: 'Santos', country: 'Brazil', region: 'South America', lat: -23.9, lng: -46.3 },
    
    // Afrika
    'durban': { name: 'Durban', country: 'South Africa', region: 'Africa', lat: -29.9, lng: 31.0 },
    'cape_town': { name: 'Cape Town', country: 'South Africa', region: 'Africa', lat: -33.9, lng: 18.4 }
  };

  private static readonly PREDEFINED_ROUTES: Record<string, Route> = {
    // Avrupa - Asya (Süveyş Kanalı)
    'rotterdam-shanghai': {
      from: 'rotterdam', to: 'shanghai',
      distance: 11200, transitDays: 28,
      canals: ['Suez Canal'],
      restrictions: ['Max beam: 77.5m', 'Max draft: 20.1m']
    },
    'hamburg-singapore': {
      from: 'hamburg', to: 'singapore',
      distance: 10800, transitDays: 27,
      canals: ['Suez Canal'],
      restrictions: ['Max beam: 77.5m', 'Max draft: 20.1m']
    },
    
    // Akdeniz - Karadeniz (Boğazlar)
    'istanbul-constanta': {
      from: 'istanbul', to: 'constanta',
      distance: 280, transitDays: 2,
      canals: ['Bosphorus', 'Dardanelles'],
      restrictions: ['Max LOA: 300m', 'Max beam: 58m', 'Dangerous cargo restrictions']
    },
    
    // Atlantik - Pasifik (Panama Kanalı)
    'houston-shanghai': {
      from: 'houston', to: 'shanghai',
      distance: 13500, transitDays: 34,
      canals: ['Panama Canal'],
      restrictions: ['Max beam: 49m', 'Max LOA: 366m', 'Max draft: 15.2m']
    },
    
    // Avrupa - Orta Doğu
    'rotterdam-jebel_ali': {
      from: 'rotterdam', to: 'jebel_ali',
      distance: 6800, transitDays: 17,
      canals: ['Suez Canal'],
      restrictions: ['Max beam: 77.5m', 'Max draft: 20.1m']
    },
    
    // Karadeniz rotaları
    'constanta-istanbul': {
      from: 'constanta', to: 'istanbul',
      distance: 280, transitDays: 2,
      canals: ['Bosphorus', 'Dardanelles'],
      restrictions: ['Max LOA: 300m', 'Max beam: 58m']
    }
  };

  /**
   * İki liman arasındaki optimal rotayı hesapla
   */
  async calculateRoute(fromPort: string, toPort: string, vesselData?: any): Promise<RoutingResult> {
    try {
      const fromPortKey = this.normalizePortName(fromPort);
      const toPortKey = this.normalizePortName(toPort);
      
      // Önce önceden tanımlanmış rotaları kontrol et
      const routeKey = `${fromPortKey}-${toPortKey}`;
      const reverseRouteKey = `${toPortKey}-${fromPortKey}`;
      
      let primaryRoute = MaritimeRoutingService.PREDEFINED_ROUTES[routeKey] ||
                        MaritimeRoutingService.PREDEFINED_ROUTES[reverseRouteKey];
      
      if (!primaryRoute) {
        // Eğer önceden tanımlanmış rota yoksa, bölgesel analiz ile hesapla
        primaryRoute = this.calculateRouteByRegion(fromPortKey, toPortKey);
      }
      
      // Alternatif rotalar
      const alternatives = this.calculateAlternativeRoutes(fromPortKey, toPortKey, primaryRoute);
      
      // Gemi uygunluğu analizi
      const vesselSuitability = this.analyzeVesselSuitability(primaryRoute, vesselData);
      
      // Zaman analizi
      const timeAnalysis = this.calculateTimeAnalysis(primaryRoute, fromPortKey, toPortKey);
      
      return {
        primaryRoute,
        alternatives,
        vesselSuitability,
        timeAnalysis
      };
      
    } catch (error) {
      logger.error('Error calculating maritime route:', error);
      
      // Fallback to basic route
      return this.createFallbackRoute(fromPort, toPort);
    }
  }

  /**
   * GPT için rota analizi prompt'u oluştur
   */
  generateRouteAnalysisPrompt(fromPort: string, toPort: string, vesselData?: any): string {
    const routingResult = this.calculateRoute(fromPort, toPort, vesselData);
    
    return `
MARITIME ROUTE ANALYSIS:

FROM: ${fromPort}
TO: ${toPort}

PRIMARY ROUTE:
- Distance: ${routingResult.then(r => r.primaryRoute.distance)} nautical miles
- Transit Time: ${routingResult.then(r => r.primaryRoute.transitDays)} days
- Canals/Straits: ${routingResult.then(r => r.primaryRoute.canals.join(', ') || 'None')}
- Restrictions: ${routingResult.then(r => r.primaryRoute.restrictions?.join(', ') || 'None')}

VESSEL COMPATIBILITY:
${vesselData ? `
- Vessel: ${vesselData.name || 'Unknown'}
- DWT: ${vesselData.dwt || 'Unknown'}
- Beam: ${vesselData.beam || 'Unknown'}
- Draft: ${vesselData.draft || 'Unknown'}
- LOA: ${vesselData.loa || 'Unknown'}
` : 'No vessel data provided'}

ROUTING CONSIDERATIONS:
1. Suez Canal: Required for Europe-Asia routes (saves ~6000 nm vs Cape route)
2. Panama Canal: Required for Atlantic-Pacific routes (saves ~8000 nm vs Cape Horn)
3. Turkish Straits: Only route for Black Sea access (size restrictions apply)
4. Weather seasons: Monsoon (May-Sep), Winter storms (Nov-Mar)
5. Piracy areas: Gulf of Aden, West Africa, Southeast Asia

Please analyze the route efficiency, time compatibility with cargo laycan, and any operational challenges.
`;
  }

  private normalizePortName(portName: string): string {
    if (!portName) return '';
    
    const normalized = portName.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    
    // Port name mapping
    const portMappings: Record<string, string> = {
      'rotterdan': 'rotterdam',
      'antwerpen': 'antwerp',
      'le_havre': 'le_havre',
      'havre': 'le_havre',
      'shangai': 'shanghai',
      'singapor': 'singapore',
      'hong_kong': 'hong_kong',
      'hongkong': 'hong_kong',
      'new_york': 'new_york',
      'newyork': 'new_york',
      'los_angeles': 'los_angeles',
      'losangeles': 'los_angeles',
      'jebel_ali': 'jebel_ali',
      'jebelali': 'jebel_ali',
      'bandar_abbas': 'bandar_abbas',
      'cape_town': 'cape_town',
      'capetown': 'cape_town'
    };
    
    return portMappings[normalized] || normalized;
  }

  private calculateRouteByRegion(fromPort: string, toPort: string): Route {
    const fromPortData = MaritimeRoutingService.MAJOR_PORTS[fromPort];
    const toPortData = MaritimeRoutingService.MAJOR_PORTS[toPort];
    
    if (!fromPortData || !toPortData) {
      return this.createBasicRoute(fromPort, toPort);
    }
    
    const route: Route = {
      from: fromPort,
      to: toPort,
      distance: 0,
      transitDays: 0,
      canals: [],
      restrictions: []
    };
    
    // Bölgesel rota hesaplama
    if (this.requiresSuezCanal(fromPortData.region, toPortData.region)) {
      route.canals.push('Suez Canal');
      route.restrictions?.push('Max beam: 77.5m', 'Max draft: 20.1m');
      route.distance = this.estimateDistanceViaSuez(fromPortData, toPortData);
    } else if (this.requiresPanamaCanal(fromPortData.region, toPortData.region)) {
      route.canals.push('Panama Canal');
      route.restrictions?.push('Max beam: 49m', 'Max LOA: 366m', 'Max draft: 15.2m');
      route.distance = this.estimateDistanceViaPanama(fromPortData, toPortData);
    } else if (this.requiresTurkishStraits(fromPortData.region, toPortData.region)) {
      route.canals.push('Bosphorus', 'Dardanelles');
      route.restrictions?.push('Max LOA: 300m', 'Max beam: 58m', 'Dangerous cargo restrictions');
      route.distance = this.estimateDistanceViaStraits(fromPortData, toPortData);
    } else {
      route.distance = this.estimateDirectDistance(fromPortData, toPortData);
    }
    
    route.transitDays = Math.round(route.distance / 400); // ~400 nm/day average speed
    
    return route;
  }

  private requiresSuezCanal(fromRegion: string, toRegion: string): boolean {
    const europeanRegions = ['North Europe', 'Mediterranean'];
    const asianRegions = ['Far East', 'Southeast Asia', 'Indian Subcontinent'];
    const middleEastRegions = ['Persian Gulf'];
    
    return (europeanRegions.includes(fromRegion) && (asianRegions.includes(toRegion) || middleEastRegions.includes(toRegion))) ||
           (asianRegions.includes(fromRegion) && europeanRegions.includes(toRegion)) ||
           (middleEastRegions.includes(fromRegion) && europeanRegions.includes(toRegion));
  }

  private requiresPanamaCanal(fromRegion: string, toRegion: string): boolean {
    const atlanticRegions = ['North Europe', 'US East Coast', 'US Gulf', 'South America'];
    const pacificRegions = ['US West Coast', 'Far East', 'Southeast Asia'];
    
    return (atlanticRegions.includes(fromRegion) && pacificRegions.includes(toRegion)) ||
           (pacificRegions.includes(fromRegion) && atlanticRegions.includes(toRegion));
  }

  private requiresTurkishStraits(fromRegion: string, toRegion: string): boolean {
    return (fromRegion === 'Black Sea' && toRegion !== 'Black Sea') ||
           (toRegion === 'Black Sea' && fromRegion !== 'Black Sea');
  }

  private estimateDistanceViaSuez(from: Port, to: Port): number {
    // Approximate distances via Suez Canal
    if (from.region === 'North Europe' && to.region === 'Far East') return 11000;
    if (from.region === 'Mediterranean' && to.region === 'Far East') return 9500;
    if (from.region === 'North Europe' && to.region === 'Persian Gulf') return 6800;
    if (from.region === 'Mediterranean' && to.region === 'Persian Gulf') return 5200;
    return 8000; // Default estimate
  }

  private estimateDistanceViaPanama(from: Port, to: Port): number {
    // Approximate distances via Panama Canal
    if (from.region === 'US East Coast' && to.region === 'Far East') return 13500;
    if (from.region === 'US Gulf' && to.region === 'Far East') return 13200;
    if (from.region === 'North Europe' && to.region === 'US West Coast') return 8500;
    return 12000; // Default estimate
  }

  private estimateDistanceViaStraits(from: Port, to: Port): number {
    // Turkish Straits distances
    if (from.region === 'Black Sea' && to.region === 'Mediterranean') return 350;
    if (from.region === 'Mediterranean' && to.region === 'Black Sea') return 350;
    return 400; // Default strait transit
  }

  private estimateDirectDistance(from: Port, to: Port): number {
    // Simple great circle distance approximation
    if (from.lat && from.lng && to.lat && to.lng) {
      const R = 3440; // Earth radius in nautical miles
      const dLat = (to.lat - from.lat) * Math.PI / 180;
      const dLon = (to.lng - from.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }
    return 5000; // Default fallback
  }

  private calculateAlternativeRoutes(_fromPort: string, _toPort: string, primaryRoute: Route): AlternativeRoute[] {
    const alternatives: AlternativeRoute[] = [];
    
    // Cape of Good Hope alternative for Suez routes
    if (primaryRoute.canals.includes('Suez Canal')) {
      alternatives.push({
        name: 'Via Cape of Good Hope',
        distance: primaryRoute.distance + 6000,
        transitDays: primaryRoute.transitDays + 15,
        canals: [],
        restrictions: [],
        additionalCost: 150000 // USD estimate
      });
    }
    
    // Cape Horn alternative for Panama routes
    if (primaryRoute.canals.includes('Panama Canal')) {
      alternatives.push({
        name: 'Via Cape Horn',
        distance: primaryRoute.distance + 8000,
        transitDays: primaryRoute.transitDays + 20,
        canals: [],
        restrictions: [],
        additionalCost: 200000 // USD estimate
      });
    }
    
    return alternatives;
  }

  private analyzeVesselSuitability(route: Route, vesselData?: any): any {
    const result = {
      suitable: true,
      restrictions: [] as string[],
      recommendations: [] as string[]
    };
    
    if (!vesselData) {
      result.recommendations.push('Vessel specifications needed for detailed route analysis');
      return result;
    }
    
    // Suez Canal restrictions
    if (route.canals.includes('Suez Canal')) {
      if (vesselData.beam && vesselData.beam > 77.5) {
        result.suitable = false;
        result.restrictions.push('Vessel beam exceeds Suez Canal limit (77.5m)');
      }
      if (vesselData.draft && vesselData.draft > 20.1) {
        result.suitable = false;
        result.restrictions.push('Vessel draft exceeds Suez Canal limit (20.1m)');
      }
    }
    
    // Panama Canal restrictions
    if (route.canals.includes('Panama Canal')) {
      if (vesselData.beam && vesselData.beam > 49) {
        result.suitable = false;
        result.restrictions.push('Vessel beam exceeds Panama Canal limit (49m)');
      }
      if (vesselData.loa && vesselData.loa > 366) {
        result.suitable = false;
        result.restrictions.push('Vessel LOA exceeds Panama Canal limit (366m)');
      }
    }
    
    // Turkish Straits restrictions
    if (route.canals.includes('Bosphorus')) {
      if (vesselData.loa && vesselData.loa > 300) {
        result.suitable = false;
        result.restrictions.push('Vessel LOA exceeds Turkish Straits limit (300m)');
      }
    }
    
    return result;
  }

  private calculateTimeAnalysis(route: Route, fromPort: string, toPort: string): any {
    let minDays = route.transitDays;
    let maxDays = route.transitDays;
    let weatherDelays = 0;
    let canalDelays = 0;
    
    // Canal delays
    if (route.canals.includes('Suez Canal')) {
      canalDelays += 1; // 1 day average
      maxDays += 2; // Possible convoy delays
    }
    if (route.canals.includes('Panama Canal')) {
      canalDelays += 1;
      maxDays += 1;
    }
    if (route.canals.includes('Bosphorus')) {
      canalDelays += 0.5;
      maxDays += 1;
    }
    
    // Weather delays by season and route
    const currentMonth = new Date().getMonth();
    if (currentMonth >= 10 || currentMonth <= 2) { // Winter
      weatherDelays += 2;
      maxDays += 3;
    } else if (currentMonth >= 4 && currentMonth <= 8) { // Monsoon season
      if (toPort.includes('mumbai') || fromPort.includes('mumbai')) {
        weatherDelays += 1;
        maxDays += 2;
      }
    }
    
    return {
      minTransitDays: minDays,
      maxTransitDays: Math.round(maxDays),
      weatherDelays: Math.round(weatherDelays),
      canalDelays: Math.round(canalDelays)
    };
  }

  private createBasicRoute(fromPort: string, toPort: string): Route {
    return {
      from: fromPort,
      to: toPort,
      distance: 5000,
      transitDays: 12,
      canals: [],
      restrictions: []
    };
  }

  private createFallbackRoute(fromPort: string, toPort: string): RoutingResult {
    return {
      primaryRoute: this.createBasicRoute(fromPort, toPort),
      alternatives: [],
      vesselSuitability: {
        suitable: true,
        restrictions: [],
        recommendations: ['Route analysis requires more detailed port information']
      },
      timeAnalysis: {
        minTransitDays: 10,
        maxTransitDays: 15,
        weatherDelays: 1,
        canalDelays: 0
      }
    };
  }
}
