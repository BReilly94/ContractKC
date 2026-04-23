import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { ContractAccessGuard } from '../common/contract-access.guard.js';
import { SearchService, type SearchResult } from './search.service.js';

@Controller('api/contracts/:id/search')
@UseGuards(AuthGuard, ContractAccessGuard)
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}

  @Get()
  async search(
    @Param('id') contractId: string,
    @Query('q') q?: string,
    @Query('kinds') kinds?: string,
  ): Promise<SearchResult> {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('q is required');
    }
    const want = (kinds ?? 'email,document,chunk').split(',').map((s) => s.trim().toLowerCase());
    return this.service.run(contractId, q, {
      includeEmails: want.includes('email') || want.includes('all'),
      includeDocuments: want.includes('document') || want.includes('all'),
      includeChunks: want.includes('chunk') || want.includes('all'),
    });
  }
}
