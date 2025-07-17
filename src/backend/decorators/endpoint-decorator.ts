/**
 * Sistema de decorators para documentação de endpoints
 * Similar ao Spring Boot com @RestController, @GetMapping, etc.
 */

export interface EndpointMetadata {
    method: string;
    path: string;
    description: string;
    tags: string[];
    parameters?: ParameterMetadata[];
    requestBody?: RequestBodyMetadata;
    responses?: ResponseMetadata[];
    examples?: ExampleMetadata[];
}

export interface ParameterMetadata {
    name: string;
    type: string;
    required: boolean;
    description: string;
    in: 'path' | 'query' | 'header' | 'body';
}

export interface RequestBodyMetadata {
    type: string;
    required: boolean;
    description: string;
    schema?: any;
}

export interface ResponseMetadata {
    statusCode: number;
    description: string;
    type: string;
    schema?: any;
}

export interface ExampleMetadata {
    name: string;
    description: string;
    request?: any;
    response?: any;
}

// Decorator para marcar uma classe como controller
export function ApiController(prefix: string = '') {
    return function (target: any) {
        target.prototype._apiPrefix = prefix;
        target.prototype._isApiController = true;
    };
}

// Decorator para GET endpoints
export function Get(path: string, metadata?: Partial<EndpointMetadata>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const endpoint: EndpointMetadata = {
            method: 'GET',
            path: path,
            description: metadata?.description || `${propertyKey} endpoint`,
            tags: metadata?.tags || [],
            parameters: metadata?.parameters || [],
            responses: metadata?.responses || [
                {
                    statusCode: 200,
                    description: 'Sucesso',
                    type: 'object'
                }
            ],
            examples: metadata?.examples || []
        };

        if (!target._endpoints) {
            target._endpoints = [];
        }
        target._endpoints.push(endpoint);

        // Marcar o método como endpoint documentado
        descriptor.value._isDocumentedEndpoint = true;
        descriptor.value._endpointMetadata = endpoint;
    };
}

// Decorator para POST endpoints
export function Post(path: string, metadata?: Partial<EndpointMetadata>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const endpoint: EndpointMetadata = {
            method: 'POST',
            path: path,
            description: metadata?.description || `${propertyKey} endpoint`,
            tags: metadata?.tags || [],
            parameters: metadata?.parameters || [],
            requestBody: metadata?.requestBody,
            responses: metadata?.responses || [
                {
                    statusCode: 200,
                    description: 'Sucesso',
                    type: 'object'
                }
            ],
            examples: metadata?.examples || []
        };

        if (!target._endpoints) {
            target._endpoints = [];
        }
        target._endpoints.push(endpoint);

        descriptor.value._isDocumentedEndpoint = true;
        descriptor.value._endpointMetadata = endpoint;
    };
}

// Decorator para PUT endpoints
export function Put(path: string, metadata?: Partial<EndpointMetadata>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const endpoint: EndpointMetadata = {
            method: 'PUT',
            path: path,
            description: metadata?.description || `${propertyKey} endpoint`,
            tags: metadata?.tags || [],
            parameters: metadata?.parameters || [],
            requestBody: metadata?.requestBody,
            responses: metadata?.responses || [
                {
                    statusCode: 200,
                    description: 'Sucesso',
                    type: 'object'
                }
            ],
            examples: metadata?.examples || []
        };

        if (!target._endpoints) {
            target._endpoints = [];
        }
        target._endpoints.push(endpoint);

        descriptor.value._isDocumentedEndpoint = true;
        descriptor.value._endpointMetadata = endpoint;
    };
}

// Decorator para DELETE endpoints
export function Delete(path: string, metadata?: Partial<EndpointMetadata>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const endpoint: EndpointMetadata = {
            method: 'DELETE',
            path: path,
            description: metadata?.description || `${propertyKey} endpoint`,
            tags: metadata?.tags || [],
            parameters: metadata?.parameters || [],
            responses: metadata?.responses || [
                {
                    statusCode: 200,
                    description: 'Sucesso',
                    type: 'object'
                }
            ],
            examples: metadata?.examples || []
        };

        if (!target._endpoints) {
            target._endpoints = [];
        }
        target._endpoints.push(endpoint);

        descriptor.value._isDocumentedEndpoint = true;
        descriptor.value._endpointMetadata = endpoint;
    };
}

// Decorator para PATCH endpoints
export function Patch(path: string, metadata?: Partial<EndpointMetadata>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const endpoint: EndpointMetadata = {
            method: 'PATCH',
            path: path,
            description: metadata?.description || `${propertyKey} endpoint`,
            tags: metadata?.tags || [],
            parameters: metadata?.parameters || [],
            requestBody: metadata?.requestBody,
            responses: metadata?.responses || [
                {
                    statusCode: 200,
                    description: 'Sucesso',
                    type: 'object'
                }
            ],
            examples: metadata?.examples || []
        };

        if (!target._endpoints) {
            target._endpoints = [];
        }
        target._endpoints.push(endpoint);

        descriptor.value._isDocumentedEndpoint = true;
        descriptor.value._endpointMetadata = endpoint;
    };
}

// Decorator para adicionar tags
export function ApiTags(...tags: string[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            descriptor.value._endpointMetadata.tags = tags;
        }
    };
}

// Decorator para adicionar descrição
export function ApiDescription(description: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            descriptor.value._endpointMetadata.description = description;
        }
    };
}

// Decorator para adicionar parâmetros
export function ApiParam(name: string, type: string, required: boolean = false, description: string = '', in_: 'path' | 'query' | 'header' = 'query') {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            if (!descriptor.value._endpointMetadata.parameters) {
                descriptor.value._endpointMetadata.parameters = [];
            }
            descriptor.value._endpointMetadata.parameters.push({
                name,
                type,
                required,
                description,
                in: in_
            });
        }
    };
}

// Decorator para adicionar request body
export function ApiBody(type: string, required: boolean = false, description: string = '') {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            descriptor.value._endpointMetadata.requestBody = {
                type,
                required,
                description
            };
        }
    };
}

// Decorator para adicionar respostas
export function ApiResponse(statusCode: number, description: string, type: string = 'object') {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            if (!descriptor.value._endpointMetadata.responses) {
                descriptor.value._endpointMetadata.responses = [];
            }
            descriptor.value._endpointMetadata.responses.push({
                statusCode,
                description,
                type
            });
        }
    };
}

// Decorator para adicionar exemplos
export function ApiExample(name: string, description: string, request?: any, response?: any) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (descriptor.value._endpointMetadata) {
            if (!descriptor.value._endpointMetadata.examples) {
                descriptor.value._endpointMetadata.examples = [];
            }
            descriptor.value._endpointMetadata.examples.push({
                name,
                description,
                request,
                response
            });
        }
    };
} 