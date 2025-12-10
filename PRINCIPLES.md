# The Principle-Guided Programming Guide  
This reference provides a detailed breakdown of core software engineering principles, complete with "Violating" vs. "Adhering" code examples to illustrate practical application.

## 1. The SOLID Principles  
The foundation of maintainable Object-Oriented Design.

### S - Single Responsibility Principle (SRP)  
Definition: A class should have only one reason to change. It should do one thing and do it well.

Bad (Violates SRP):  
The UserManager handles authentication, email notifications, and database logging.
```python
class UserManager:
    def register(self, username, password):
        # Logic to save user to DB
        db.save(username, password)
        
        # Logic to send email - Reason to change #1
        email_service.send(username, "Welcome!")
        
        # Logic to log activity - Reason to change #2
        logger.log(f"User {username} registered")
````

Good (Adheres to SRP):
Responsibilities are delegated to specialized classes.

```python
class UserManager:
    def __init__(self, email_service, logger):
        self.email_service = email_service
        self.logger = logger

    def register(self, username, password):
        db.save(username, password)
        self.email_service.send_welcome_email(username)
        self.logger.log_registration(username)
```

### O - Open/Closed Principle (OCP)
Definition: Software entities should be open for extension, but closed for modification.

Bad (Violates OCP):
We have to modify the class every time we add a new shape.

```python
class AreaCalculator:
    def calculate(self, shape):
        if shape.type == "circle":
            return 3.14 * shape.radius ** 2
        elif shape.type == "square":  # Modification needed here
            return shape.side ** 2
```

Good (Adheres to OCP):
We extend functionality by creating new classes, leaving the calculator untouched.

```python
class Shape:
    def area(self): pass

class Circle(Shape):
    def area(self): return 3.14 * self.radius ** 2

class Square(Shape):
    def area(self): return self.side ** 2

class AreaCalculator:
    def calculate(self, shape):
        return shape.area()  # Works for any new shape automatically
```

### L - Liskov Substitution Principle (LSP)
Definition: Subtypes must be substitutable for their base types without breaking the application.

Bad (Violates LSP):
A Penguin is a bird, but it can't fly, causing the program to crash if treated like a generic Bird.

```python
class Bird:
    def fly(self): pass

class Penguin(Bird):
    def fly(self):
        raise Exception("I can't fly!")  # Breaks substitution
```

Good (Adheres to LSP):
Refactor the hierarchy so common traits are true for all subclasses.

```python
class Bird: pass

class FlyingBird(Bird):
    def fly(self): pass

class Sparrow(FlyingBird):
    def fly(self): ...

class Penguin(Bird):
    def swim(self): ...
```

### I - Interface Segregation Principle (ISP)
Definition: Clients should not be forced to depend on interfaces they do not use.

Bad (Violates ISP):
A Robot class is forced to implement `eat()`, which it doesn't need.

```python
class IWorker:
    def work(self): pass
    def eat(self): pass

class Robot(IWorker):
    def work(self): ...
    def eat(self): raise Exception("I don't eat")
```

Good (Adheres to ISP):
Split large interfaces into smaller ones.

```python
class IWorkable:
    def work(self): pass

class IFeedable:
    def eat(self): pass

class Robot(IWorkable):
    def work(self): ...
```

### D - Dependency Inversion Principle (DIP)
Definition: Depend on abstractions (interfaces), not concrete implementations.

Bad (Violates DIP):

```python
class Store:
    def __init__(self):
        self.stripe = StripePayment()  # Hard dependency

    def purchase(self):
        self.stripe.pay()
```

Good (Adheres to DIP):

```python
class Store:
    def __init__(self, payment_processor: PaymentProcessor):
        self.payment_processor = payment_processor

    def purchase(self):
        self.payment_processor.pay()
```

## 2. Core Axioms (Efficiency and Simplicity)

### DRY - Don't Repeat Yourself
Definition: Every piece of knowledge must have a single, unambiguous representation.

Bad:

```python
def get_user_full_name(user):
    return f"{user.first_name} {user.last_name}"

def print_receipt(user):
    # Logic repeated
    name = f"{user.first_name} {user.last_name}"
    print(f"Receipt for {name}")
```

Good:

```python
class User:
    def get_full_name(self):
        return f"{self.first_name} {self.last_name}"

print(f"Receipt for {user.get_full_name()}")
```

## KISS - Keep It Simple, Stupid
Definition: Avoid unnecessary complexity.

Bad:

```python
def is_valid(x):
    return True if (x & 1) and (x != 0) else False
```

Good:

```python
def is_valid(x):
    return x > 0 and x % 2 != 0
```

## YAGNI - You Ain't Gonna Need It
Definition: Don't implement features until they are required.

Bad:

```python
class Report:
    def generate_pdf(self): ...
    def generate_xml(self): ...  # Not needed yet
```

Good:

```python
class Report:
    def generate_pdf(self): ...
```

## 3. Architecture and Clean Code

Separation of Concerns (SoC)
Definition: Distinct sections of code should handle distinct logical concerns.

Bad:

```python
def get_user_page(id):
    user = db.query(f"SELECT * FROM users WHERE id = {id}")
    return f"<h1>Hello {user.name}</h1>"
```

Good:

```python
# Repository Layer
def get_user(id):
    return db.query(...)

# View Layer
def render_user_page(user):
    return render_template("profile.html", user=user)

# Controller Layer
def controller(id):
    user = get_user(id)
    return render_user_page(user)
```

Law of Demeter (Principle of Least Knowledge)

Bad:

```python
city = order.get_customer().get_address().get_city()
```

Good:

```python
city = order.get_shipping_city()
```

## React-specific principles
### Hook Ordering and Dependency Discipline

React’s hook model is powerful precisely because it is simple: hooks are just JavaScript function calls whose *order* establishes component behavior. That simplicity becomes fragile when callbacks, effects, and derived values are scattered across a large component. The following principles formalize a disciplined approach to hook layout and dependency management so that temporal ordering bugs are prevented rather than learned the hard way.

#### 1. Define Hooks in Logical, Predictable Order

Hooks are ordinary JavaScript constants. Any effect or memoized computation that references a callback must only appear *after* that callback is defined. Declaring callbacks first eliminates temporal dead zones where a hook attempts to capture a value that does not yet exist. Grouping hooks by category—state, then memoized callbacks, then effects—makes the execution flow legible and keeps forward references visible during review.

#### 2. Derive Dependencies Systematically

The dependency array of a hook should be read as executable code. Mentally evaluate it in parallel with the callback body: every external value the callback touches must appear in the array. This practice reveals missing dependencies, forward references, and accidental captures. Tooling reinforces this rigor: rules such as `react-hooks/exhaustive-deps` ensure consistency and prevent subtle stale-closure bugs.

#### 3. Limit the Breadth of Single Components

As components grow to hundreds of lines, the spatial separation between a hook and its consumers increases the likelihood of order-related errors. Large components tend to blur their internal boundaries, mixing concerns and scattering hooks unpredictably. Extracting coherent logic into custom hooks (for example, `useSidePanelConnection`) localizes ordering, collapses mental scope, and restricts cross-hook coupling. The smaller the surface area, the harder it is for dependencies to become entangled.

#### 4. Apply SOLID and KISS to Hook Design

A hook with a single responsibility has a sharply defined set of inputs and outputs. That clarity makes it more difficult to lose track of where values originate or to accidentally capture an unrelated symbol. Smaller, simpler units also exhibit fewer internal dependencies, making ordering mistakes easier to spot during review. When hooks remain bite-sized, the dependency graph remains shallow and predictable.

#### 5. Use TypeScript and ESLint as Structural Guardrails

Strict TypeScript settings and ESLint rules already present in the codebase serve as early warning systems. Complaints about undefined identifiers, unused variables, or suspicious ordering patterns often signal deeper structural issues with hook layout. Treat these warnings as structural diagnostics rather than nuisances; resolving them ensures that many runtime failures never make it past static analysis.

Together, these practices create a predictable, self-documenting hook architecture. Components become easier to read, maintain, and extend because their temporal and logical structure is explicit rather than incidental.