# Scan Guide — Spring Boot

Use this guide to locate every piece of information needed for the FFL in a Spring Boot project. Read each source file type listed below; map what you find to the corresponding FFL template field.

---

## 1. Project version & name

**Maven (`pom.xml`):**
```xml
<groupId>com.example</groupId>
<artifactId>my-service</artifactId>   ← Project Name
<version>1.2.3</version>             ← Version
```

**Gradle (`build.gradle` / `build.gradle.kts`):**
```groovy
group = 'com.example'
version = '1.2.3'       ← Version
// project name is in settings.gradle: rootProject.name = 'my-service'
```

Read `settings.gradle` for `rootProject.name` (Gradle) or `<artifactId>` (Maven).

---

## 2. Base URL / Context path

**Read committed files only (Step 0 of the FFL workflow).** Skip any config file that is gitignored or untracked — most commonly `application-local.yml`, `application-local.properties`, or any profile file listed in `.gitignore`.

Read **in this priority order** (committed files only):

1. `src/main/resources/application.yml` — look for:
   ```yaml
   server:
     port: 8080
     servlet:
       context-path: /api/v1
   ```
2. `src/main/resources/application.properties` — look for:
   ```
   server.port=8080
   server.servlet.context-path=/api/v1
   ```
3. Committed profile-specific files only: `application-prod.yml`, `application-production.properties`. **Skip** `application-local.*` and any other file that is gitignored.

Compose the base URL as `http(s)://[host]:[port][context-path]`. For internal services use the actual hostname/port from the config. If no context-path is set, the base is `http://[host]:[port]`.

**Externalized / env-var values:** If `server.port` or `context-path` reference a `${ENV_VAR}` placeholder (e.g. `server.port: ${SERVER_PORT:8080}`), emit the placeholder (`${SERVER_PORT:8080}`) with the note `(externalized — value not committed)`. Never use a value read from a gitignored local config file as the base URL.

---

## 3. Controllers / Entry points

**Coverage rule:** Enumerate **every** `@RestController` / `@Controller` class found. Each controller becomes its own `### 2.x` flow section in the FFL — do not represent multiple controllers with a single diagram, even when they share a base package or path prefix ("grouped controllers"). Within a controller, if endpoints call different services, different repositories, or have different `@PreAuthorize` / `@Secured` rules, give each such endpoint its own `#### 2.x.y [METHOD /path]` sub-diagram.

Scan all Java/Kotlin files under `src/main/` for `@RestController` or `@Controller`. Only read files returned by `git ls-files` (Step 0).

For each controller:

1. **Class-level mapping:** `@RequestMapping("/base-path")` on the class.
2. **Method-level mapping:** `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`, or `@RequestMapping(method = RequestMethod.GET, ...)` on each method.
3. Compose full path: `[context-path] + [class-level mapping] + [method-level mapping]`.
4. Note **method name** and **return type** (the response shape).
5. Note `@RequestBody` parameter — its type is the request body shape.
6. Note `@PathVariable`, `@RequestParam` — include in the endpoint path / request note.
7. Note `@PreAuthorize`, `@Secured`, or `@RolesAllowed` — these are the guards.

**Example:**
```java
@RestController
@RequestMapping("/users")          // class path
public class UserController {

    @GetMapping("/{id}")            // full path: /api/v1/users/{id}
    public UserDto getUser(@PathVariable Long id) { ... }

    @PostMapping                    // full path: /api/v1/users
    public UserDto createUser(@RequestBody CreateUserRequest body) { ... }
}
```

Build a list: `[HTTP METHOD] [full path] → [controllerClass.methodName()] → returns [ResponseType]`.

---

## 4. Services

For each service class (`@Service` annotation) called from a controller, read the file.

**What to extract:**
- Class name and method names.
- Which repository methods are called (next step).
- Business logic that affects the flow (validation, transformation, error throwing).
- Exception types thrown — these become error branches in the diagram.

---

## 5. Repositories

For each repository interface (`@Repository`, `extends JpaRepository<T,ID>`, `extends CrudRepository`, or `extends MongoRepository`) referenced from services:

- Note the entity type (`T`) → this is the data model.
- Custom `@Query` methods → note the query intent.
- Include in the flow as the persistence layer: `Service → Repository → Database`.

---

## 6. DTOs and response shapes

Read the DTO / record classes that are used as `@RequestBody` parameters or return types. Extract their field names and types. These become the **Request Body** and **Response Shape** columns in the endpoint table.

---

## 7. Exception handling

Look for `@ControllerAdvice` or `@RestControllerAdvice` classes. For each `@ExceptionHandler` method:
- Note which exception it handles.
- Note the HTTP status code returned (from `@ResponseStatus` or `ResponseEntity` return).
- Include in the flow's error branches (e.g. `ResourceNotFoundException → 404`).

---

## 8. Security

Look for `SecurityFilterChain` or `WebSecurityConfigurerAdapter` (`@Configuration` + `@EnableWebSecurity`):
- Note which paths require authentication.
- Note JWT / OAuth2 filter configuration.
- Include as guards/interceptors in the FFL Architecture section.

---

## Flow shape for Spring Boot

The typical flow in a sequence diagram:

```
Client/User → Controller → Service → Repository → Database
                                  ↘ ExternalAPIClient (if present)
```

Map these to the sequence diagram participants:
```
actor User
participant CTRL as ControllerName
participant SVC as ServiceName
participant REPO as RepositoryName
participant DB as Database
```

For purely REST-to-REST microservice calls (no direct DB), add:
```
participant EXTERNAL as ExternalService
```

---

## Mapping to FFL template fields

| FFL field | Source |
|-----------|--------|
| Project Name | `settings.gradle` `rootProject.name` or `pom.xml` `<artifactId>` |
| Version | `build.gradle` `version` or `pom.xml` `<version>` |
| Platforms | `Spring Boot [version from pom.xml/build.gradle spring-boot plugin]` |
| Architecture Pattern | MVC / Layered Architecture / Clean Architecture |
| Entry point | Full URL path from controller mapping |
| Component | Controller class name + method name |
| Guards | `@PreAuthorize`, `@Secured`, or Security filter chain rules |
| Endpoints called | `HTTP METHOD /full/path` (composed from context-path + class + method mappings) |
| Base URL | From `application.yml`/`.properties` `server.port` + `server.servlet.context-path` |
| Called by | `ControllerName.methodName()` |
| Request Body | `@RequestBody` parameter type and its fields |
| Response Shape | Return type (DTO/record) and its fields |

---

## Key directories to document in §1.2

| Directory | Purpose |
|-----------|---------|
| `src/main/java/.../controller/` | REST controllers |
| `src/main/java/.../service/` | Business logic |
| `src/main/java/.../repository/` | Data access (JPA / Mongo / etc.) |
| `src/main/java/.../dto/` | Request/response transfer objects |
| `src/main/java/.../model/` or `entity/` | Domain entities |
| `src/main/java/.../config/` | Security, beans, application config |
| `src/main/resources/` | `application.yml`, `application.properties`, SQL migrations |

---

## Spring Boot version

To find the Spring Boot version:
- `pom.xml`: look for `<parent><version>3.x.x</version>` under `spring-boot-starter-parent`, or the `spring-boot` plugin version.
- `build.gradle`: `id("org.springframework.boot") version "3.x.x"` or `springBootVersion` variable.
