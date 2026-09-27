import { Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository';

@Injectable()
export class PermissionsService {
  constructor(private readonly permissionsRepository: PermissionsRepository) {}

  findAll() {
    return this.permissionsRepository.findAll();
  }

  findByCodes(codes: string[]) {
    return this.permissionsRepository.findByCodes(codes);
  }
}
