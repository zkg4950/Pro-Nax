/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React, { useState, useMemo } from 'react';
import { 
  COUNTRY_CPM_RATES, 
  DEFAULT_CPM_RATE, 
  getCpmRateForCountry, 
  getCountriesByTier,
  calculateRevenueByCountry,
  type CountryCpmRate,
  type CountryTier 
} from '@/lib/countryCpmRates';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Globe, TrendingUp, DollarSign, PieChart } from 'lucide-react';

export function CountryCpmTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTier, setSelectedTier] = useState<CountryTier | 'all'>('all');
  const [viewsInput, setViewsInput] = useState('1000');
  const [selectedCountry, setSelectedCountry] = useState('US');

  // Filter countries based on search and tier
  const filteredCountries = useMemo(() => {
    return COUNTRY_CPM_RATES.filter(country => {
      const matchesSearch = 
        country.countryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        country.countryCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTier = selectedTier === 'all' || country.tier === selectedTier;
      return matchesSearch && matchesTier;
    });
  }, [searchTerm, selectedTier]);

  // Calculate revenue for selected country
  const revenueCalculation = useMemo(() => {
    const views = parseInt(viewsInput) || 1000;
    return calculateRevenueByCountry(selectedCountry, views);
  }, [selectedCountry, viewsInput]);

  // Tier statistics
  const tierStats = useMemo(() => {
    const tiers: CountryTier[] = ['tier1', 'tier2', 'tier3'];
    return tiers.map(tier => {
      const countries = getCountriesByTier(tier);
      const avgCpm = countries.reduce((sum, country) => {
        const rate = getCpmRateForCountry(country.countryCode);
        return sum + rate.baseCpm;
      }, 0) / (countries.length || 1);
      
      return {
        tier,
        count: countries.length,
        avgCpm: avgCpm.toFixed(2),
      };
    });
  }, []);

  const tierColors: Record<CountryTier, string> = {
    tier1: 'bg-green-500',
    tier2: 'bg-blue-500', 
    tier3: 'bg-yellow-500',
    default: 'bg-gray-500',
  };

  const tierLabels: Record<CountryTier, string> = {
    tier1: 'Premium',
    tier2: 'Mid-Value',
    tier3: 'Emerging',
    default: 'Default',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Country-Based CPM Rates</h2>
          <p className="text-muted-foreground">
            Manage geolocation-based ad revenue rates by country and economic tier
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Globe className="h-4 w-4" />
          Refresh Rates
        </Button>
      </div>

      <Tabs defaultValue="rates" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rates">CPM Rates</TabsTrigger>
          <TabsTrigger value="calculator">Revenue Calculator</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Country CPM Configuration</CardTitle>
              <CardDescription>
                View and manage CPM rates for different countries organized by economic tiers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search countries..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <Select value={selectedTier} onValueChange={(value) => setSelectedTier(value as CountryTier | 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="tier1">Tier 1 - Premium</SelectItem>
                    <SelectItem value="tier2">Tier 2 - Mid-Value</SelectItem>
                    <SelectItem value="tier3">Tier 3 - Emerging</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Base CPM</TableHead>
                      <TableHead>Multiplier</TableHead>
                      <TableHead>Effective CPM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCountries.map((country) => (
                      <TableRow key={country.countryCode}>
                        <TableCell className="font-medium">{country.countryName}</TableCell>
                        <TableCell>{country.countryCode}</TableCell>
                        <TableCell>
                          <Badge className={tierColors[country.tier]}>
                            {tierLabels[country.tier]}
                          </Badge>
                        </TableCell>
                        <TableCell>${country.baseCpm.toFixed(2)}</TableCell>
                        <TableCell>{country.multiplier.toFixed(2)}x</TableCell>
                        <TableCell className="font-semibold">
                          ${(country.baseCpm * country.multiplier).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredCountries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No countries found matching your search
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredCountries.length} of {COUNTRY_CPM_RATES.length} countries
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Calculator</CardTitle>
              <CardDescription>
                Calculate expected revenue based on country-specific CPM rates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Country</label>
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CPM_RATES.map((country) => (
                        <SelectItem key={country.countryCode} value={country.countryCode}>
                          {country.countryName} ({country.countryCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Number of Views</label>
                  <Input
                    type="number"
                    value={viewsInput}
                    onChange={(e) => setViewsInput(e.target.value)}
                    placeholder="1000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Country
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{revenueCalculation.countryName}</div>
                    <div className="text-xs text-muted-foreground">{revenueCalculation.countryCode}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Effective CPM
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${revenueCalculation.effectiveCpm.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">per 1,000 views</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Gross Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${revenueCalculation.grossRevenue.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">total revenue</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <PieChart className="h-4 w-4" />
                      Creator Share
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">${revenueCalculation.creatorShare.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">55% of revenue</div>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Revenue Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Views:</span>
                    <span className="font-medium">{revenueCalculation.viewsCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Country Tier:</span>
                    <span className="font-medium capitalize">{revenueCalculation.tier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Share (45%):</span>
                    <span className="font-medium">${revenueCalculation.platformShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Creator Earnings (55%):</span>
                    <span className="text-green-600">${revenueCalculation.creatorShare.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tierStats.map((stat) => (
              <Card key={stat.tier}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${tierColors[stat.tier]}`} />
                    {tierLabels[stat.tier]} Markets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.count}</div>
                  <div className="text-sm text-muted-foreground">countries</div>
                  <div className="mt-2 text-lg font-semibold text-green-600">
                    ${stat.avgCpm} avg CPM
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tier Overview</CardTitle>
              <CardDescription>
                Summary of CPM rates by economic tier
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(['tier1', 'tier2', 'tier3'] as CountryTier[]).map((tier) => {
                  const countries = getCountriesByTier(tier);
                  const topCountries = countries.slice(0, 5);
                  
                  return (
                    <div key={tier} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${tierColors[tier]}`} />
                          <h4 className="font-semibold">{tierLabels[tier]} Markets</h4>
                        </div>
                        <Badge variant="secondary">{countries.length} countries</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                        {topCountries.map((country) => {
                          const rate = getCpmRateForCountry(country.countryCode);
                          return (
                            <div key={country.countryCode} className="bg-muted/50 p-2 rounded">
                              <div className="font-medium truncate">{country.countryName}</div>
                              <div className="text-xs text-muted-foreground">{country.countryCode}</div>
                              <div className="text-green-600 font-semibold">${rate.baseCpm.toFixed(2)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}